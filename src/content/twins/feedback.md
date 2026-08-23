# Feedback

This form is **anonymous by construction**: your message is encrypted in your browser to my public key, so I can't tell who sent it, and the server never sees plaintext.

## How it works

The page encrypts your message with [age](https://age-encryption.org) before it leaves your browser. The server only accepts ciphertext, stores nothing, doesn't record your IP address, and relays the encrypted message straight to my inbox, where only I can decrypt it. The [code is public](https://github.com/agucova/web-future) (though, as with anything E2EE on the web, you're ultimately trusting the code this site serves you).

Since it's anonymous, I can't reply, so include contact info if you'd like a response. Messages relay in real time, so I can see roughly *when* one arrives; if that timing alone could identify you, hold your message and send it later.

## Sending without a browser

This form needs JavaScript. The encryption happens in your browser, so there's no way around it. If you'd rather not enable it, you can PGP-encrypt an email to me instead (see [/pgp](https://agucova.dev/pgp)).

The submit path is gated by a Cloudflare Turnstile challenge, so it is a browser channel rather than an API. To reach me without one, encrypt to the age or PGP recipients on [/keys](https://agucova.dev/keys) and send the result by email.
