FROM --platform=linux/amd64 node:16.16.0
COPY package.json package.json
RUN npm install
COPY . .
CMD [ "yarn", "start" ]
