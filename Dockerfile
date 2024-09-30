FROM node:20.16.0

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./
RUN npm install
COPY . .
# If you are building your code for production
# RUN npm ci --only=production

# Bundle app source
COPY ./modifiedNpms/axios-retry/lib/esm/index.js ./node_modules/axios-retry/lib/esm/index.js

EXPOSE 8080
CMD ["sh","-c", "node index.js"]