#!/bin/bash
set -e

DIR="$(dirname "$0")"
cd "$DIR"

if [ ! -d "libcaption" ]; then
    echo "Cloning libcaption..."
    git clone https://github.com/szatmary/libcaption.git
else
    echo "Updating libcaption..."
    git -C libcaption pull
fi

cd libcaption
echo "Building libcaption..."
cmake -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DCMAKE_BUILD_TYPE=Release .
make
