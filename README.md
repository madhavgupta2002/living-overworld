# Living Overworld

A pixel-art overworld you can reshape while you play by typing requests ("turn the village into a snowy forest"). The model returns validated world edits; all art is generated in JavaScript.

Controls: WASD / arrows to move, E / Space to interact. Touch controls included. Progress is saved in the browser.

## Run

Requires Node 22+.

```bash
npm install
cp .env.example .env   # add a NEW Bedrock API key and BEDROCK_MODEL_ID
npm start              # http://127.0.0.1:3000
```

Without a configured `.env` the game still runs; only AI edits are disabled. `.env` is gitignored. Never commit API keys.
