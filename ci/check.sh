# The arm's required check (`test`): the game task's accept.sh with its pass
# bar moved from the score to integrity, because a required check on the
# acceptance bar would hold every PR out of an empty main (0/333) forever.
# It refuses a changed, missing, or extra file in tests/ (the fixture's
# pinned digests, as accept.sh), runs every acceptance test with the score
# reporter, prints the score per section and overall, refuses a run in
# which not all 333 tests ran (a test file failed to load) and any
# src/**/*.js that `node --check` rejects, and otherwise passes whatever
# the score. The queue worker ejects a PR that changes ci/, .github/,
# dagger.json, or .dagger/, so an agent can't make this check pass by
# editing it.
set -eu
THRESHOLD=0
TOTAL=333
# The runners' sandbox has node at this absolute path and no PATH lookup
# to rely on; elsewhere (a plain git checkout) the node on PATH serves.
node=/usr/local/bin/node
[ -x "$node" ] || node=$(command -v node)
"$node" -e '
const { createHash } = require("crypto");
const { readFileSync, readdirSync } = require("fs");
const pinned = JSON.parse(process.argv[1]);
const have = readdirSync("tests").sort();
let bad = 0;
for (const f of new Set([...Object.keys(pinned), ...have])) {
  let sum = null;
  try { sum = createHash("sha256").update(readFileSync("tests/" + f)).digest("hex"); } catch {}
  if (sum !== pinned[f]) { bad++; console.log("tests: " + f + " is " + (sum === null ? "missing" : pinned[f] ? "changed" : "not part of the suite") + "; restore tests/ exactly as given (DESIGN.md is the contract)"); }
}
process.exit(bad ? 1 : 0);
' '{"01-rng.test.mjs":"0a754161dc5b9c8a67347ac68043d6ecc0c8dc1b2db5605b5b1697d23245d4d6","02-level-validate.test.mjs":"6575488d4b994ded94a522106d856d47ba842d51125c6e63d27b567ade39bcdc","03-level-parse.test.mjs":"aeffdf47242b4712b8c8ec4b660c536726e13463e0070bf15f74cc424df96459","04-init.test.mjs":"bede774e7daf0c19ccbe71e63fb9c11b9c0e1f418af7e0e69c043a42e9240625","05-movement.test.mjs":"b41e5535e910714642cca856ed286b0f68e6e4b56f2cb5b621e6291bc94165b9","06-patches.test.mjs":"75edb507be6da64d9939511ab5b0d0f0316c8110dba768cf661ded1e4530b054","07-merge-score.test.mjs":"531ce97eb8978e8d48957de98bb5f95ab56e2af2e529d8ecbcb4ba40d8a35e6b","08-quorum-exit.test.mjs":"ab1c661e89e9210a8d4b877472478bb4f93572dc5c67ba25ba343275a73c48c0","09-drifts.test.mjs":"2e1309c67b957f8b5bb6e5a686e70763aa269c3366af1c59a372ef09c1242683","10-conflicts.test.mjs":"64f8da94636289639bc422b068ae69a9104174a196e9eeeeb6beb9a7d1c9159f","11-hits.test.mjs":"afda85400f44f48938741ea50eb561b3d71a225e81fc8745bb815971342b038d","12-spawns.test.mjs":"f47216e5ca1d38424b2cc3d82d26331be24334c6a039974fd7105da7f13dfdc4","13-pause-status.test.mjs":"ca8a88b3b553c823956ade7442c00d3b88a79d4d9fe1c4149c3c6508e8e34d82","14-purity.test.mjs":"75e6939426f0286921a27e4f40425085cbaa4094f4f73fe4c8d79d8ed11bc2dc","15-invariants.test.mjs":"803445db93fe01216ecf223f25cbb6a4e38ed42031dcb09e5570b512eca8bd47","16-levels-data.test.mjs":"f5a244a81ff2d6d480935f662e9da1b9257c885c14480f38177bfef133884eb8","17-bot.test.mjs":"285bd7f11e68ede9ed76f6be66186c818b73ba0a3d356a35bfa9800c966f22a2","18-render.test.mjs":"2793ce4158cd88af7d33857ace298532b487e8047b302ca21bf16c1653814f1c","19-input.test.mjs":"699e539b62b4ffdd971adab50985316335c516d7643db20e6c8830f862fb387b","20-audio.test.mjs":"bcea9b156de9c4942e6df9e819b30220b4458520770b6f5bc1c9a2132e51c612","21-ui.test.mjs":"1f130677dd4f02d6b64ea937cea1a1218a162ff2f0cd0efd915c63b33862cfb1","22-scores.test.mjs":"613520aa198ea20a259412a8420f82a74c63b58ba45df2eeff78e2f06df20b45","23-browser.test.mjs":"9f2baddb4c896cbb04b3cdaa5361ba98f9c4f7564fa1ca3091399313905244ce","24-settings.test.mjs":"a3972a34eb1536602d795f059534e7c296be38e9427573e1ec9b2dea78fec55d","25-replay.test.mjs":"bf6c8e6ee715dcae6ce3129b70c551cbf8c4d8607474ded52b92d83f65f97d5e","26-generate.test.mjs":"2b92eb8601005600c864ae88d8f18f298d1851ab64ebfea66ec2761abe9a580a","27-editor.test.mjs":"a1ba80f16eec57afd6720c2121c32c676847f7742255929a46098f252eb1e7ef","28-achievements.test.mjs":"8226b2a90d47066b8455aa54b609c95113c2acd56380da1f0feecfe0ae0d1b05","29-stats.test.mjs":"f5c3ca8fb5661dd40016a09f3318067bf4c5709ad56620c5c689f18527314ff7","30-particles.test.mjs":"0bd1900ba0c10116d1e8e8ae06bee4388e58070538b680029178b98f5191c455","31-music.test.mjs":"1b1a74b7e4edfa841143ffafacfa6dc7fbe582b3020163ca5f70d23549d0ab38","helpers.mjs":"e6f89f7442f38faf743fcb86f2d535aec3bf65fdb92d7ff70949efaf01e69d36","run.mjs":"a0c0b03bf7fc964ccc545936f1a3a79d3a3d9016b678652d52eeeb2416c1707a","score.mjs":"8f7d5fcdeef64584fab18ea3d088dd53d2fd5917eec17f37e5c5cc3d4d17e4d1"}'
out=$("$node" --no-warnings --test --test-isolation=none --test-timeout=20000 --test-reporter=./tests/score.mjs tests/*.test.mjs 2>&1) || true
printf '%s\n' "$out"
score=${out##*passed }
passed=${score%/*}
total=${score#*/}
case "$passed$total" in
    '' | *[!0-9]*) echo "score: no score line (a test run that crashed or hung)"; exit 1 ;;
esac
if [ "$total" -ne "$TOTAL" ]; then
    echo "score: $total tests ran, not $TOTAL: a test file failed to load"
    exit 1
fi
echo "score: $passed of $total ($((passed * 100 / total))%)"
bad=0
for f in $(find src -name '*.js' | sort); do
    "$node" --check "$f" || { echo "syntax: $f does not parse"; bad=1; }
done
[ "$bad" -eq 0 ] || exit 1
echo "check: tests/ intact, all $TOTAL tests ran, every src/ module parses"
