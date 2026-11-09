export function appUrl() {
  return process.env.APP_URL || (process.env.NODE_ENV==="production"?"https://smart-todolist.giorgi.app":"http://localhost:3000");
}
