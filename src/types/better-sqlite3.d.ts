declare module 'better-sqlite3' {
  type DatabaseInstance = any;
  interface DatabaseConstructor {
    new (file: string, options?: any): DatabaseInstance;
  }
  const Database: DatabaseConstructor;
  namespace Database {
    type Database = DatabaseInstance;
  }
  export default Database;
}
