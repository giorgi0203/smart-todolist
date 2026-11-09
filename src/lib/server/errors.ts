export class AppError extends Error {
  status:number;
  retryAfter?:number;
  constructor(status:number,message:string,retryAfter?:number){super(message);this.status=status;this.retryAfter=retryAfter;}
}
