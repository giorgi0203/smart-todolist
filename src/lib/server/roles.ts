/** Keep public products on separate route surfaces even though they share a build. */
export function roleAllowsPath(role:string|undefined,path:string){
  if(role==='learning')return path==='/api/health'||path==='/api/auth/session'||path==='/api/auth/logout'||path==='/api/auth/sso/start'||path==='/api/auth/sso/callback'||path==='/api/learning/experiments'||path.startsWith('/api/learning/experiments/')||path==='/api/learning/progress';
  if(role==='identity'){
    if(path.startsWith('/api/auth/sso/'))return false;
    return ['/', '/embed','/account','/analytics','/verify-email','/favicon.ico'].includes(path)||path.startsWith('/_next/')||path.startsWith('/api/auth/')||path.startsWith('/api/sso/')||path==='/api/analytics/event'||path==='/api/health';
  }
  return !path.startsWith('/api/learning/');
}
