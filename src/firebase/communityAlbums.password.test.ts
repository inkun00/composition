import { beforeEach, describe, expect, it, vi } from "vitest";
import { albumPasswordProof } from "./albumPassword";
import { createCommunityAlbum, deleteCommunityAlbum, enterCommunityAlbum, setCommunityAlbumPassword } from "./communityAlbums";

const mocks = vi.hoisted(() => ({
  setDoc: vi.fn(),
  getDocs: vi.fn(),
  batch: { set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn() }
}));

vi.mock("./client", () => ({ firestore: {} }));
vi.mock("firebase/firestore", () => ({
  collection: () => ({ path: "communityAlbums" }),
  doc: (_parent: unknown, ...segments: string[]) => segments.length
    ? { id: segments.at(-1), path: segments.join("/") }
    : { id: "new-album", path: "communityAlbums/new-album" },
  deleteDoc: vi.fn(),
  getDocs: mocks.getDocs,
  serverTimestamp: () => "server-time",
  setDoc: mocks.setDoc,
  writeBatch: () => mocks.batch
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setDoc.mockResolvedValue(undefined);
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

  it("구성원별 접근 기록에는 평문 암호가 아닌 검증값을 쓴다", async () => {
    const salt = "a".repeat(32);
    await enterCommunityAlbum("album-1", "friend-1", "우리반1234", salt);
    expect(mocks.setDoc).toHaveBeenCalledWith(
      { id: "friend-1", path: "albumMemberAccess/album-1/users/friend-1" },
      { proof: await albumPasswordProof("우리반1234", salt) }
    );
  });

  it("앨범 삭제 시 노래와 암호 정보까지 함께 지운다", async () => {
    const songRef = { id: "song-1", path: "communityAlbums/album-1/songs/song-1" };
    mocks.getDocs.mockResolvedValue({ docs: [{ ref: songRef }] });

    await deleteCommunityAlbum("album-1");

    expect(mocks.batch.delete).toHaveBeenCalledWith(songRef);
    expect(mocks.batch.delete).toHaveBeenCalledWith({ id: "album-1", path: "albumSecrets/album-1" });
    expect(mocks.batch.delete).toHaveBeenCalledWith({ id: "album-1", path: "communityAlbums/album-1" });
    expect(mocks.batch.commit).toHaveBeenCalledTimes(2);
  });
});
