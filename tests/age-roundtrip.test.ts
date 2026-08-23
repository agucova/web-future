/**
 * Proves the client-side encryption path produces valid armored age
 * ciphertext: encrypt exactly the way the /feedback page does, check the
 * Worker's armor validator accepts it, and decrypt it back with a
 * throwaway identity (standing in for the real offline key).
 *
 * Run with: bun test
 */
import { describe, expect, test } from "bun:test";
import {
	Decrypter,
	Encrypter,
	armor,
	generateIdentity,
	identityToRecipient,
} from "age-encryption";

import { isArmoredAgeMessage } from "../src/worker/feedback";

/** Encrypts the way src/pages/feedback.astro does. */
async function encryptLikeTheForm(recipient: string, plaintext: string): Promise<string> {
	const encrypter = new Encrypter();
	encrypter.addRecipient(recipient);
	return armor.encode(await encrypter.encrypt(plaintext));
}

describe("age round-trip (client encryption path)", () => {
	test("encrypts to armored ciphertext that decrypts back to the plaintext", async () => {
		const identity = await generateIdentity();
		const recipient = await identityToRecipient(identity);
		expect(recipient.startsWith("age1")).toBe(true);

		const plaintext = "About: the /feedback form\n\nHola! Ünïcödé works too — ¯\\_(ツ)_/¯";
		const armored = await encryptLikeTheForm(recipient, plaintext);

		expect(armored.startsWith("-----BEGIN AGE ENCRYPTED FILE-----")).toBe(true);
		expect(armored.trimEnd().endsWith("-----END AGE ENCRYPTED FILE-----")).toBe(true);

		const decrypter = new Decrypter();
		decrypter.addIdentity(identity);
		const decrypted = await decrypter.decrypt(armor.decode(armored), "text");
		expect(decrypted).toBe(plaintext);
	});

	test("armored output passes the Worker's validator", async () => {
		const identity = await generateIdentity();
		const recipient = await identityToRecipient(identity);

		for (const plaintext of ["short", "x".repeat(10_000), "multi\nline\nfeedback"]) {
			const armored = await encryptLikeTheForm(recipient, plaintext);
			expect(isArmoredAgeMessage(armored)).toBe(true);
		}
	});

	test("the Worker's validator rejects non-ciphertext", async () => {
		expect(isArmoredAgeMessage("hello, this is plaintext feedback")).toBe(false);
		expect(isArmoredAgeMessage("")).toBe(false);
		expect(
			isArmoredAgeMessage(
				"-----BEGIN AGE ENCRYPTED FILE-----\nnot base64 at all!!\n-----END AGE ENCRYPTED FILE-----",
			),
		).toBe(false);
		// Base64-wrapped plaintext inside a valid-looking envelope must fail
		// the age file magic check.
		const b64Plaintext = btoa("this is readable feedback, just base64-encoded so it looks opaque....");
		const smuggled = [
			"-----BEGIN AGE ENCRYPTED FILE-----",
			...(b64Plaintext.match(/.{1,64}/g) ?? []),
			"-----END AGE ENCRYPTED FILE-----",
		].join("\n");
		expect(isArmoredAgeMessage(smuggled)).toBe(false);
		// Plaintext smuggled around a valid-looking envelope must not pass.
		const identity = await generateIdentity();
		const recipient = await identityToRecipient(identity);
		const armored = await encryptLikeTheForm(recipient, "hi");
		expect(isArmoredAgeMessage(`leak this plaintext\n${armored}`)).toBe(false);
		expect(isArmoredAgeMessage(`${armored}\nleak this plaintext`)).toBe(false);
	});
});
