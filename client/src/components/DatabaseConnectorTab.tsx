import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import {
  Server,
  Database,
  AlertCircle,
  CheckCircle,
  Loader2,
  Shield,
  Play,
} from "lucide-react";

interface DatabaseConnectorTabProps {
  projectId: string | null;
  onComplete: (result: any) => void;
}

export function DatabaseConnectorTab({ projectId, onComplete }: DatabaseConnectorTabProps) {
  const { toast } = useToast();
  const [dbType, setDbType] = useState<'postgresql' | 'mysql' | 'mongodb'>('postgresql');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

  // PostgreSQL / MySQL fields
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState(5432);
  const [database, setDatabase] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [query, setQuery] = useState('SELECT * FROM your_table LIMIT 1000');
  const [ssl, setSsl] = useState(false);

  // MongoDB fields
  const [connectionString, setConnectionString] = useState('mongodb://localhost:27017');
  const [mongoDatabase, setMongoDatabase] = useState('');
  const [collection, setCollection] = useState('');
  const [mongoQuery, setMongoQuery] = useState('{}');
  const [limit, setLimit] = useState(1000);

  if (!projectId) {
    return (
      <div className="p-6 text-center">
        <Database className="w-12 h-12 mx-auto text-gray-400 mb-3" />
        <p className="text-gray-600 font-medium">Project Required</p>
        <p className="text-sm text-gray-500 mt-1">
          Please create a project first by uploading a file, then connect additional data sources here.
        </p>
      </div>
    );
  }

  const handleDbTypeChange = (type: string) => {
    setDbType(type as 'postgresql' | 'mysql' | 'mongodb');
    setConnectionStatus('idle');
    setError('');
    if (type === 'mysql') setPort(3306);
    else if (type === 'postgresql') setPort(5432);
  };

  const buildConfig = () => {
    if (dbType === 'mongodb') {
      let parsedQuery = {};
      try {
        parsedQuery = mongoQuery.trim() ? JSON.parse(mongoQuery) : {};
      } catch {
        throw new Error('Invalid MongoDB query JSON');
      }
      return {
        connectionString,
        database: mongoDatabase,
        collection,
        query: parsedQuery,
        limit,
      };
    }
    return { host, port, database, username, password, query, ssl };
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setConnectionStatus('idle');
    setError('');

    try {
      const config = buildConfig();
      // For SQL databases, use a LIMIT 1 test query
      const testConfig = dbType === 'mongodb'
        ? { ...config, limit: 1 }
        : { ...config, query: `${(config.query as string).replace(/;\s*$/, '')} LIMIT 1` };

      const result = await apiClient.ingestDataSource({
        sourceType: dbType,
        projectId: projectId!,
        config: testConfig,
        label: `Test_${dbType}`,
      });

      if (result.success) {
        setConnectionStatus('success');
        toast({
          title: "Connection Successful",
          description: `Connected to ${dbType} database. Found ${result.recordCount} test record(s).`,
        });
      } else {
        throw new Error(result.error || 'Connection test failed');
      }
    } catch (err: any) {
      setConnectionStatus('error');
      setError(err.message || 'Connection test failed');
      toast({
        title: "Connection Failed",
        description: err.message || 'Could not connect to database',
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleImport = async () => {
    setIsConnecting(true);
    setError('');

    try {
      const config = buildConfig();
      const label = dbType === 'mongodb'
        ? `${mongoDatabase}.${collection}`
        : `${database}_query`;

      const result = await apiClient.ingestDataSource({
        sourceType: dbType,
        projectId: projectId!,
        config,
        label,
      });

      if (result.success) {
        toast({
          title: "Data Imported",
          description: `Successfully imported ${result.recordCount} records from ${dbType}.`,
        });
        onComplete(result);
      } else {
        throw new Error(result.error || 'Import failed');
      }
    } catch (err: any) {
      setError(err.message || 'Import failed');
      toast({
        title: "Import Failed",
        description: err.message || 'Could not import data',
        variant: "destructive",
      });
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="space-y-4 pt-4">
      <Alert className="border-blue-200 bg-blue-50">
        <Shield className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800 text-xs">
          Credentials are used for this session only and are not stored on our servers.
        </AlertDescription>
      </Alert>

      <Tabs value={dbType} onValueChange={handleDbTypeChange}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="postgresql" className="text-xs">
            <Server className="w-3 h-3 mr-1" /> PostgreSQL
          </TabsTrigger>
          <TabsTrigger value="mysql" className="text-xs">
            <Server className="w-3 h-3 mr-1" /> MySQL
          </TabsTrigger>
          <TabsTrigger value="mongodb" className="text-xs">
            <Database className="w-3 h-3 mr-1" /> MongoDB
          </TabsTrigger>
        </TabsList>

        {/* PostgreSQL / MySQL form */}
        <TabsContent value="postgresql">
          <SQLForm
            host={host} setHost={setHost}
            port={port} setPort={setPort}
            database={database} setDatabase={setDatabase}
            username={username} setUsername={setUsername}
            password={password} setPassword={setPassword}
            query={query} setQuery={setQuery}
            ssl={ssl} setSsl={setSsl}
            dbType="postgresql"
          />
        </TabsContent>
        <TabsContent value="mysql">
          <SQLForm
            host={host} setHost={setHost}
            port={port} setPort={setPort}
            database={database} setDatabase={setDatabase}
            username={username} setUsername={setUsername}
            password={password} setPassword={setPassword}
            query={query} setQuery={setQuery}
            ssl={ssl} setSsl={setSsl}
            dbType="mysql"
          />
        </TabsContent>

        {/* MongoDB form */}
        <TabsContent value="mongodb">
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Connection String</Label>
              <Input
                value={connectionString}
                onChange={e => setConnectionString(e.target.value)}
                placeholder="mongodb://localhost:27017"
                className="text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Database</Label>
                <Input
                  value={mongoDatabase}
                  onChange={e => setMongoDatabase(e.target.value)}
                  placeholder="my_database"
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Collection</Label>
                <Input
                  value={collection}
                  onChange={e => setCollection(e.target.value)}
                  placeholder="my_collection"
                  className="text-sm"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Query Filter (JSON)</Label>
              <Textarea
                value={mongoQuery}
                onChange={e => setMongoQuery(e.target.value)}
                placeholder='{"status": "active"}'
                className="text-sm font-mono h-20"
              />
            </div>
            <div>
              <Label className="text-xs">Limit</Label>
              <Input
                type="number"
                value={limit}
                onChange={e => setLimit(parseInt(e.target.value) || 1000)}
                min={1}
                max={100000}
                className="text-sm w-32"
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Status + Error */}
      {connectionStatus === 'success' && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 text-xs">
            Connection test successful. Ready to import data.
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={handleTestConnection}
          disabled={isTesting || isConnecting}
          className="flex-1"
        >
          {isTesting ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Testing...</>
          ) : (
            <><Play className="w-4 h-4 mr-2" /> Test Connection</>
          )}
        </Button>
        <Button
          onClick={handleImport}
          disabled={isConnecting || isTesting}
          className="flex-1"
        >
          {isConnecting ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</>
          ) : (
            <><Database className="w-4 h-4 mr-2" /> Import Data</>
          )}
        </Button>
      </div>
    </div>
  );
}

// Shared SQL form for PostgreSQL and MySQL
function SQLForm({
  host, setHost, port, setPort, database, setDatabase,
  username, setUsername, password, setPassword,
  query, setQuery, ssl, setSsl, dbType,
}: {
  host: string; setHost: (v: string) => void;
  port: number; setPort: (v: number) => void;
  database: string; setDatabase: (v: string) => void;
  username: string; setUsername: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  query: string; setQuery: (v: string) => void;
  ssl: boolean; setSsl: (v: boolean) => void;
  dbType: string;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Label className="text-xs">Host</Label>
          <Input
            value={host}
            onChange={e => setHost(e.target.value)}
            placeholder="localhost"
            className="text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Port</Label>
          <Input
            type="number"
            value={port}
            onChange={e => setPort(parseInt(e.target.value) || (dbType === 'mysql' ? 3306 : 5432))}
            className="text-sm"
          />
        </div>
      </div>
      <div>
        <Label className="text-xs">Database Name</Label>
        <Input
          value={database}
          onChange={e => setDatabase(e.target.value)}
          placeholder="my_database"
          className="text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Username</Label>
          <Input
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="db_user"
            className="text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Password</Label>
          <Input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="********"
            className="text-sm"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={ssl} onCheckedChange={setSsl} id="ssl-toggle" />
        <Label htmlFor="ssl-toggle" className="text-xs">Use SSL</Label>
      </div>
      <div>
        <Label className="text-xs">SQL Query</Label>
        <Textarea
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="SELECT * FROM your_table LIMIT 1000"
          className="text-sm font-mono h-24"
        />
        <p className="text-xs text-gray-500 mt-1">
          Tip: Use LIMIT to control the number of rows imported.
        </p>
      </div>
    </div>
  );
}
