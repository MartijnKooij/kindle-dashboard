#!/usr/bin/env sh
# Fetch a new dashboard image, make sure to output it to "$1".
$(dirname $0)/../ht -d -q -o "$1" get https://d3kn4zxh6vmwei.cloudfront.net/dashboard.png