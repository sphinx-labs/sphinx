FROM ghcr.io/foundry-rs/foundry:nightly
RUN apk add --upgrade yarn
RUN apk add nodejs-current --repository="http://dl-cdn.alpinelinux.org/alpine/edge/community"
RUN apk add --update npm
RUN apk add --update lsof
RUN apk add --update bash
RUN apk add --update git
RUN apk add --update openssh
SHELL ["/bin/bash", "-c"]
