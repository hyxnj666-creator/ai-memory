FROM ghcr.io/charmbracelet/vhs:latest
# vhs official image is Debian-based; add Node.js so the demo tape can
# invoke `node /vhs/dist/index.js rules …` without npm link.
RUN apt-get update -qq && apt-get install -y -qq nodejs && rm -rf /var/lib/apt/lists/*
