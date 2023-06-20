files=$(git diff --diff-filter=ACMRT -w --name-only $2 $3 )

if [[ $files == *$1* ]]
then
  echo 'true'
else
  echo 'false'
fi
