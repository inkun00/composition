import { beforeEach, describe, expect, it, vi } from "vitest";
import { albumPasswordProof } from "./albumPassword";
import { createCommunityAlbum, deleteCommunityAlbum, listPublishedSongs, renameCommunityAlbum, setCommunityAlbumPassword } from "./communityAlbums";

const mocks = vi.hoisted(() => ({
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  getDocs: vi.fn(),
  firebaseAuth: { currentUser: { uid: "owner-1" } as { uid: string } | null },
  batch: { set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn() }
}));

vi.mock("./client", () => ({ firestore: {}, firebaseAuth: mocks.firebaseAuth }));
vi.mock("firebase/firestore", () => ({
  collection: () => ({ path: "communityAlbums" }),
  doc: (_parent: unknown, ...segments: string[]) => segments.length
    ? { id: segments.at(-1), path: segments.join("/") }
    : { id: "new-album", path: "communityAlbums/new-album" },
  deleteDoc: vi.fn(),
  getDocs: mocks.getDocs,
  serverTimestamp: () => "server-time",
  setDoc: mocks.setDoc,
  updateDoc: mocks.updateDoc,
  writeBatch: () => mocks.batch
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.firebaseAuth.currentUser = { uid: "owner-1" };
  mocks.setDoc.mockResolvedValue(undefined);
  mocks.updateDoc.mockResolvedValue(undefined);
  mocks.batch.commit.mockResolvedValue(undefined);
});

describe("암호 있는 앨범 저장", () => {
  it("앨범과 비공개 암호 검증값을 한 번의 쓰기로 만든다", async () => {
    const album = await createCommunityAlbum("owner-1", "민준", "우리 반", "maeum", "우리반1234");
    const albumData = mocks.batch.set.mock.calls[0][1];
    const secretData = mocks.batch.set.mock.calls[1][1];

    expect(mocks.setDoc).toHaveBeenCalledWith({ id: "owner-1", path: "albumCreatorAccess/owner-1" }, { code: "maeum" });
    expect(albumData).toMatchObject({ name: "우리 반", ownerId: "owner-1", locked: true });
    expect(albumData).not.toHaveProperty("proof");
    expect(albumData.passwordSalt).toMatch(/^[0-9a-f]{32}$/);
    expect(secretData).toEqual({ ownerId: "owner-1", proof: await albumPasswordProof("우리반1234", albumData.passwordSalt) });
    expect(mocks.batch.commit).toHaveBeenCalledOnce();
    expect(album.locked).toBe(true);
  });

  it("암호를 바꿀 때 새 소금값을 쓰고 해제할 때 비공개 검증값을 지운다", async () => {
    const changed = await setCommunityAlbumPassword("album-1", "owner-1", "새암호1234");
    expect(changed.locked).toBe(true);
    expect(mocks.batch.update).toHaveBeenCalledWith(
      { id: "album-1", path: "communityAlbums/album-1" },
      expect.objectContaining({ locked: true, passwordSalt: changed.passwordSalt })
    );
    expect(mocks.batch.set).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    await setCommunityAlbumPassword("album-1", "owner-1", "");
    expect(mocks.batch.update).toHaveBeenCalledWith(
      { id: "album-1", path: "communityAlbums/album-1" },
      expect.objectContaining({ locked: false, passwordSalt: "" })
    );
    expect(mocks.batch.delete).toHaveBeenCalledWith({ id: "album-1", path: "albumSecrets/album-1" });
  });

  it("앨범 읽기는 암호 검증 기록을 쓰지 않는다", async () => {
    mocks.getDocs.mockResolvedValue({ docs: [] });

    expect(await listPublishedSongs("album-1")).toEqual([]);

    expect(mocks.getDocs).toHaveBeenCalledOnce();
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it("삭제 전 만든 사람의 암호 검증값을 먼저 확인한다", async () => {
    const salt = "a".repeat(32);
    mocks.getDocs.mockResolvedValue({ docs: [] });
    mocks.setDoc.mockImplementationOnce(async () => {
      expect(mocks.getDocs).not.toHaveBeenCalled();
      expect(mocks.batch.delete).not.toHaveBeenCalled();
    });

    await deleteCommunityAlbum("album-1", { userId: "owner-1", password: "  우리반1234  ", salt });

    expect(mocks.setDoc).toHaveBeenCalledWith(
      { id: "album-1", path: "albumDeletionAccess/album-1" },
      { ownerId: "owner-1", proof: await albumPasswordProof("우리반1234", salt), verifiedAt: "server-time" }
    );
  });

  it("암호 검증이 거절되면 노래를 조회하거나 지우지 않는다", async () => {
    mocks.setDoc.mockRejectedValueOnce(new Error("permission-denied"));

    await expect(deleteCommunityAlbum("album-1", {
      userId: "owner-1", password: "틀린암호", salt: "a".repeat(32)
    })).rejects.toThrow("permission-denied");

    expect(mocks.getDocs).not.toHaveBeenCalled();
    expect(mocks.batch.delete).not.toHaveBeenCalled();
    expect(mocks.batch.commit).not.toHaveBeenCalled();
  });

  it("암호 없이 요청해도 서버 확인이 거절되면 삭제 전에 멈춘다", async () => {
    mocks.setDoc.mockRejectedValueOnce(new Error("permission-denied"));

    await expect(deleteCommunityAlbum("album-1")).rejects.toThrow("permission-denied");

    expect(mocks.setDoc).toHaveBeenCalledWith(
      { id: "album-1", path: "albumDeletionAccess/album-1" },
      { ownerId: "owner-1", proof: "", verifiedAt: "server-time" }
    );
    expect(mocks.getDocs).not.toHaveBeenCalled();
    expect(mocks.batch.delete).not.toHaveBeenCalled();
  });

  it("로그인 정보 없이 삭제를 요청하면 쓰기 전에 멈춘다", async () => {
    mocks.firebaseAuth.currentUser = null;

    await expect(deleteCommunityAlbum("album-1")).rejects.toThrow("login-required");

    expect(mocks.setDoc).not.toHaveBeenCalled();
    expect(mocks.getDocs).not.toHaveBeenCalled();
    expect(mocks.batch.delete).not.toHaveBeenCalled();
  });

  it.each([
    { password: "   ", salt: "a".repeat(32) },
    { password: "우리반1234", salt: "" }
  ])("삭제 암호와 소금값이 없으면 쓰기 전에 멈춘다: %j", async (authorization) => {
    await expect(deleteCommunityAlbum("album-1", { userId: "owner-1", ...authorization }))
      .rejects.toThrow("missing-album-password");

    expect(mocks.setDoc).not.toHaveBeenCalled();
    expect(mocks.getDocs).not.toHaveBeenCalled();
    expect(mocks.batch.delete).not.toHaveBeenCalled();
  });

  it("앨범 삭제 시 노래와 암호 정보까지 함께 지운다", async () => {
    const songRef = { id: "song-1", path: "communityAlbums/album-1/songs/song-1" };
    mocks.getDocs.mockResolvedValue({ docs: [{ ref: songRef }] });

    await deleteCommunityAlbum("album-1");

    expect(mocks.batch.delete).toHaveBeenCalledWith(songRef);
    expect(mocks.batch.delete).toHaveBeenCalledWith({ id: "album-1", path: "albumSecrets/album-1" });
    expect(mocks.batch.delete).toHaveBeenCalledWith({ id: "album-1", path: "albumDeletionAccess/album-1" });
    expect(mocks.batch.delete).toHaveBeenCalledWith({ id: "album-1", path: "communityAlbums/album-1" });
    expect(mocks.batch.commit).toHaveBeenCalledTimes(2);
    expect(mocks.setDoc).toHaveBeenCalledWith(
      { id: "album-1", path: "albumDeletionAccess/album-1" },
      { ownerId: "owner-1", proof: "", verifiedAt: "server-time" }
    );
  });

  it("앨범 이름만 수정하고 공백과 길이를 검증한다", async () => {
    expect(await renameCommunityAlbum("album-1", "  새 이름  ")).toBe("새 이름");
    expect(mocks.updateDoc).toHaveBeenCalledWith(
      { id: "album-1", path: "communityAlbums/album-1" },
      { name: "새 이름", updatedAt: "server-time" }
    );
    await expect(renameCommunityAlbum("album-1", "   ")).rejects.toThrow("invalid-album-name");
    await expect(renameCommunityAlbum("album-1", "가".repeat(41))).rejects.toThrow("invalid-album-name");
    expect(mocks.updateDoc).toHaveBeenCalledOnce();
  });
});
