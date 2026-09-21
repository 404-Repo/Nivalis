# NIVALIS: OPERATION 404

Beyond the last transmission, the compound is still listening. Descend beneath the ice. Find what keeps it awake.

An atmospheric first-person game in three connected chapters. Infiltrate a frozen machine outpost, uncover what lies beneath, and face what follows. Stealth, environmental puzzles and a dark, evolving synth score accompany one continuous operation.

## Choose your edition

| Edition | Play online | Download |
| --- | --- | --- |
| **Original** | [Play the original](https://404-repo.github.io/Nivalis/game/) | [Original campaign ZIP](https://github.com/404-Repo/Nivalis/raw/refs/heads/main/NIVALIS-Operation-404-Complete-Campaign.zip) |
| **Cel-shaded** | [Play the cel-shaded edition](https://404-repo.github.io/Nivalis/cel/) | [Cel-shaded campaign ZIP](https://github.com/404-Repo/Nivalis/raw/refs/heads/main/NIVALIS-Operation-404-Cel-Atlas-Edition.zip) |

The cel-shaded edition reimagines the same three-chapter campaign with graphic outlines, stylized materials, varied scenery and atmospheric skies. Both editions are available independently. Their progress, mementos and settings are saved separately in your browser.

## Play

Use a desktop browser with WebGL enabled. Sound is on by default; the title and pause screens share a cassette-textured drone. If your browser blocks autoplay, click, tap or press a key to start the sound. The default difficulty is **HARD**; accessibility and audio options are in **SETTINGS**.

Move with **WASD**, look with the **mouse**, and interact with **E**. Press **ESC** to pause. The in-game **CONTROLS** menu lists the full bindings. Progress saves at chapter boundaries on the current browser.

For offline play, extract either ZIP and open **PLAY.html**, or use the included local server. Each ZIP contains all three chapters, editable source, bundled assets, licenses, build tools and a verification report. Neither edition requires API keys or downloaded assets at runtime.

## Repository

- `game/` is the original static web build, published through GitHub Pages.
- `cel/` is the cel-shaded static web build, published alongside the original.
- `NIVALIS-Operation-404-Complete-Campaign.zip` is the original delivery.
- `NIVALIS-Operation-404-Cel-Atlas-Edition.zip` is the cel-shaded delivery (1.1.8).
- Each adjacent `.sha256` file verifies its ZIP; `SHA256SUMS.json` inside verifies the contents.
- `licenses/` and `cel/licenses/` retain notices for Three.js, the 404 recipe adaptations and the bundled fonts.

Built with the [404 game recipe](https://github.com/404-Repo/404-game-recipe). Music and sound effects are synthesized locally.

## Release privacy

The source delivery checks builds and ZIPs for known credential and privacy patterns, including embedded chapter code. Before publishing from a new clone, run `git config --local core.hooksPath .githooks` to enable the included pre-push check. It verifies outgoing commits, their public identity and archive contents. Approved identities are listed in `.privacy-policy.json`.

These checks are a safeguard, not an exhaustive security audit. They do not remove copies or historical releases already published.
