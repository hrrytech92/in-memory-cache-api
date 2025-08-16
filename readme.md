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