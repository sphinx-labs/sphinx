# TODO(docs)
cd ../../..

# TODO(docs): should be the same as the user-facing doc. any differences between the two are
# documented here.
mkdir hello_sphinx && cd hello_sphinx
yarn add --dev @sphinx-labs/plugins
npx sphinx init --ts --quickstart
forge test
npx sphinx deploy --config sphinx/HelloSphinx.config.ts
anvil --silent & # TODO(docs):
source .env
npx sphinx deploy --config sphinx/HelloSphinx.config.ts --broadcast --private-key \
  $PRIVATE_KEY --rpc http://127.0.0.1:8545 \
  --confirm # TODO(docs): necessary or else terminal will stall

# TODO(docs)
kill $(lsof -t -i:8545)
