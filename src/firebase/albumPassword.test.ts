import { describe, expect, it } from "vitest";
import { albumPasswordProof, newAlbumPasswordSalt } from "./albumPassword";

describe("앨범 암호 검증값", () => {
  it("암호 대신 소금값이 있는 검증값을 만들고 암호 변경을 구별한다", async () => {
    const salt = newAlbumPasswordSalt();
    const anotherSalt = newAlbumPasswordSalt();
    const proof = await albumPasswordProof("우리반1234", salt);

    expect(salt).toMatch(/^[0-9a-f]{32}$/);
    expect(anotherSalt).not.toBe(salt);
    expect(proof).toMatch(/^[0-9a-f]{64}$/);
    expect(await albumPasswordProof("우리반1234", salt)).toBe(proof);
    expect(await albumPasswordProof("틀린암호", salt)).not.toBe(proof);
    expect(await albumPasswordProof("우리반1234", anotherSalt)).not.toBe(proof);
  });
});
