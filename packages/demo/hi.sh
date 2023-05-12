# Generate the latest build info and save it to a temporary directory, "./.chugsplash-internal"
forge build --force --build-info --build-info-path ./.chugsplash-internal --extra-output storageLayout

# Generate the full foundry.toml and save it to the temporary directory in json format
forge config --json > ./.chugsplash-internal/foundryConfig.json
