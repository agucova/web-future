# Keys

Everything here is public key material, served from my own domain. Nothing on this page is secret, and every secret half lives offline. If you want to send me something private, use age. If you want to check that something came from me, use my SSH signing keys. If you want to check that this page is really mine, see identity.

## Encrypt something to me

[age](https://age-encryption.org) is the preferred way. My recipient is:

```
age187ce86uaqypfhmz55rfy630s9dp9v6s0v028mgf554m0094tmdcqw3fufl
```

```
# encrypt a file to me
curl -s https://agucova.dev/age.txt | age -R - -o secret.age file.pdf
```

### Post-quantum

I also publish a hybrid X25519 and ML-KEM recipient. Encrypting to it means an attacker has to break both the classical and the post-quantum half, which covers the case where today's ciphertext is stored and attacked years from now. It needs age 1.3 or newer.

```
# same thing, post-quantum
curl -s https://agucova.dev/age-pq.txt | age -R - -o secret.age file.pdf
```

The post-quantum recipient is about 2 KB (ML-KEM keys are large), so it is served on its own at <https://agucova.dev/age-pq.txt> rather than inlined here.

### With my SSH keys instead

age also accepts SSH public keys as recipients, so you can encrypt to me with nothing but my GitHub username.

```
curl -s https://github.com/agucova.keys > agus.keys
age -R agus.keys -o secret.age file.pdf
```

### For a conversation

Static keys are for files and one-off messages. For an actual conversation, use [Signal](https://signal.org/): `@agucova.42`.

## Identity

My accounts are tied together with an [Ariadne](https://docs.keyoxide.org/wiki/ariadne-identity/) profile, which you can verify with [Keyoxide](https://keyoxide.org/aspe:keyoxide.org:OINESA65LDHLH6SKFODDDIQXZM) or any other implementation. Verification is a public algorithm: each claimed account publishes a link back to the profile, and you can check those links yourself without trusting me or Keyoxide.

```
aspe:keyoxide.org:OINESA65LDHLH6SKFODDDIQXZM
```

The backlinks, if you want to check them by hand:

- This domain: `dig +short TXT agucova.dev`
- GitHub: [gist](https://gist.github.com/agucova/13feec4b34b49d1a78abe49f8d01c59a)

## Verify something I signed

I sign with SSH keys. One key per device, all of them listed in [allowed_signers](https://agucova.dev/allowed_signers), and also available at [github.com/agucova.keys](https://github.com/agucova.keys).

```
curl -sO https://agucova.dev/allowed_signers
ssh-keygen -Y verify -f allowed_signers -I agustin@agucova.dev \
    -n file -s document.pdf.sig < document.pdf
```

## PGP

My PGP key still works and I still read encrypted mail, but I would rather you used age. I keep it for people and tools that only speak OpenPGP. It is the same key I have used since 2021, and I do not plan to replace it.

Fingerprint: `503B 2899 F90F 9FE5 BF33 1E3C D0B5 DA36 0A0D A1E0`

```
curl https://agucova.dev/pgp.asc | gpg --import
```

The key itself is at <https://agucova.dev/pgp.asc>.
