#!/bin/sh

BRANCH_NAME=$(git branch | grep '*' | sed 's/* //')

if [ $BRANCH_NAME != '(no branch)' ]
then
  npm run precommit-script
fi
