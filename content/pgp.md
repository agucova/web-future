+++
title = "PGP"
type = "page"
date = "2022-07-13T09:55:17+0000"
layout = "single"
description = "🔐 How to reach me securely, audit my public identity and find my PGP keys."
+++

If you want to communicate with me securely, you should start by publicly auditing my identity and its associated key through my [Keybase profile](https://keybase.io/agucova). You can send me secure messages using the [Keybase app](https://keybase.io/agucova/chat/), or by sending me an encrypted email using the [OpenPGP](https://protonmail.com/blog/what-is-pgp-encryption/) protocol to [agustin@agucova.dev](mailto:agustin@agucova.dev). If your email client doesn't support it, you can find a suitable client or addon [here](https://www.openpgp.org/software/).

## A copy of my PGP key

My PGP fingerprint is: `503B 2899 F90F 9FE5 BF33 1E3C D0B5 DA36 0A0D A1E0`

64-bit: `D0B5 DA36 0A0D A1E0`

```shell
# curl + gpg pro tip: import my keys
curl https://agucova.dev/pgp.asc | gpg --import
```

<details>
<summary>Annotated PGP Key</summary>
    {{< pgp-wrapper >}}
</details>
