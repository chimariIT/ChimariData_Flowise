# Local PostgreSQL Setup Guide for ChimariData

## Quick Setup Options

### Option 1: Set PostgreSQL Password (Recommended)

1. **Find your PostgreSQL password:**
   - Check if you remember the password you set during installation
   - Or reset it using these steps:

2. **Reset PostgreSQL password (if needed):**
   ```powershell
   # Stop PostgreSQL service
   Stop-Service postgresql-x64-17
   
   # Start PostgreSQL in single-user mode (run as Administrator)
   & "C:\Program Files\PostgreSQL\17\bin\postgres.exe" --single -D "C:\Program Files\PostgreSQL\17\data" postgres
   
   # In the single-user mode, run:
   # ALTER USER postgres PASSWORD 'newpassword';
   # \q
   
   # Start PostgreSQL service normally
   Start-Service postgresql-x64-17
   ```

3. **Create the database:**
   ```powershell
   & "C:\Program Files\PostgreSQL\17\bin\createdb.exe" -U postgres chimaridata_dev
   # Enter your password when prompted
   ```

4. **Create .env file:**
   ```env
   DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/chimaridata_dev"
   NODE_ENV=development
   SESSION_SECRET="dev-session-secret-12345"
   ```

### Option 2: Use Trust Authentication (Development Only)

1. **Edit pg_hba.conf file:**
   - Open: `C:\Program Files\PostgreSQL\17\data\pg_hba.conf`
   - Find the line: `host    all             all             127.0.0.1/32            scram-sha-256`
   - Change it to: `host    all             all             127.0.0.1/32            trust`

2. **Restart PostgreSQL:**
   ```powershell
   Restart-Service postgresql-x64-17
   ```

3. **Create database without password:**
   ```powershell
   & "C:\Program Files\PostgreSQL\17\bin\createdb.exe" -U postgres chimaridata_dev
   ```

4. **Create .env file:**
   ```env
   DATABASE_URL="postgresql://postgres@localhost:5432/chimaridata_dev"
   NODE_ENV=development
   SESSION_SECRET="dev-session-secret-12345"
   ```

### Option 3: Use pgAdmin (GUI Method)

1. **Open pgAdmin 4** (if installed)
2. **Connect to PostgreSQL server**
3. **Right-click on "Databases" → Create → Database**
4. **Name:** `chimaridata_dev`
5. **Click Save**

## After Database Creation

1. **Set environment variables:**
   ```powershell
   $env:DATABASE_URL = "postgresql://postgres:yourpassword@localhost:5432/chimaridata_dev"
   $env:NODE_ENV = "development"
   ```

2. **Run database migrations:**
   ```powershell
   npm run db:push
   ```

3. **Start the application:**
   ```powershell
   npm run dev
   ```

## Troubleshooting

### Common Issues:

1. **"password authentication failed"**
   - Use Option 2 (trust authentication) for development
   - Or reset your PostgreSQL password

2. **"database does not exist"**
   - Create the database using createdb command
   - Or use pgAdmin to create it manually

3. **"connection refused"**
   - Check if PostgreSQL service is running: `Get-Service *postgresql*`
   - Start it if needed: `Start-Service postgresql-x64-17`

4. **"permission denied"**
   - Run PowerShell as Administrator
   - Or use trust authentication

### Check Connection:
```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d chimaridata_dev -c "SELECT version();"
```

## Security Note

⚠️ **Trust authentication should only be used for local development!**
Never use trust authentication in production environments.

