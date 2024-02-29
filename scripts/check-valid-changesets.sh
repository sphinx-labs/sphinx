
variable=$(yarn changeset status)
if [[ ($variable == *sphinx-labs/core* || $variable == *sphinx-labs/contracts*) && $variable != *sphinx-labs/plugins* ]]; then
    echo "Detected changesets for core or contracts, but not plugins. You must always update sphinx-labs/plugins when updating the core or contracts package. "
    exit 1
fi
