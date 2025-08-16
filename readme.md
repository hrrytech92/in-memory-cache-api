## Requirements
- Build a standalone caching service
- You should be able to **add item(s)**, **remove items**, and **fetch items**
- The data structure used to store these items is up to you
- The API definitions and formats used to communicate with this API are up to you
- The service should be runnable, allowing caching and retrieval of items
- PRO TIP: Spending time on the **cache internals** is more important than the API
- If using TypeScript/JavaScript, make sure there is a valid `package.json` in the root of the repo

---

**Run**
- npm i
- npm test
- npm run dev
- curl examples
  - put: `curl -X PUT "http://localhost:3000/cache/app/user123?ttlMs=50000" -H "Content-Type: application/json" -d "{\"value\":{\"name\":\"mike\"}}"`
  - get: `curl localhost:3000/cache/app/user123`
  - exists: `curl -I localhost:3000/cache/app/user123`
  - delete: `curl -X DELETE localhost:3000/cache/app/user123`
  - stats: `curl localhost:3000/stats`