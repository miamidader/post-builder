# Daily posts setup (about 10 minutes, on your Mac or iPhone)

1. Get a free Gemini key: go to aistudio.google.com, sign in, tap "Get API key", copy it.
2. In your GitHub repo (miamidader/post-builder): Settings > Secrets and variables > Actions > New repository secret.
   Name: GEMINI_API_KEY   Value: the key you copied.
3. Upload everything in this folder to the repo, keeping the folder structure
   (.github/workflows/daily.yml, scripts/build.mjs, data/, fonts/, package.json).
   Your existing index.html (the Post Builder) stays where it is.
4. Optional: put your Heading Now .ttf in the fonts folder. Without it the headlines use Anton.
5. Test it: repo > Actions tab > "Daily posts" > Run workflow. After about a minute your posts are at
   https://miamidader.github.io/post-builder/today/
6. It then runs by itself every morning around 6am Pacific.

AI photos (optional, about $4-8 a month): in Settings > Secrets and variables > Actions > Variables,
add GEMINI_IMAGE_MODEL with the image model name from Google's pricing page, and turn on billing in AI Studio.
Leave it unset for free posts with a plain dark background plus the photo prompt to use in the Gemini app.
