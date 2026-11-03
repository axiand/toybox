## Toybox

Requirements:

- A semi-recent version of Node.js
- `npm i`
- Use a manager like pm2 to run indefinitely.
- A web server to use as a reverse proxy.

Setup:

Social features require a `profanity_en.csv` file in the `static` directory with a list of forbidden words. You can obtain the file used in production [here](https://huggingface.co/datasets/mmathys/profanity/raw/main/profanity_en.csv).

Requires a `TOYBOX_HASH_SECRET` environment variable. Sensitive information will be hashed using this string. (psst: the `.env` file is supported!)
Requires a `TOYBOX_ADMIN_PASS` environment variable. This password is used to log into the administration system.

To disable social features, add a `TOYBOX_DISABLE_SOCIAL` environment var with the value `1`.
To disable the board, add a `TOYBOX_DISABLE_BBS` environment var with the value `1`.