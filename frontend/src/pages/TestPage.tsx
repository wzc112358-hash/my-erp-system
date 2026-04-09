import { useState } from 'react';
import { pb } from '@/lib/pocketbase';

export const TestPage: React.FC = () => {
  const [status, setStatus] = useState<string>('Testing...');
  const [loginResult, setLoginResult] = useState<string>('');

  const testConnection = async () => {
    try {
      const res = await fetch('https://api.henghuacheng.cn/api/health');
      if (res.ok) {
        setStatus('Connected! Server is running (health check OK).');
      } else if (res.status === 404) {
        setStatus('Connected! Server is running.');
      } else {
        setStatus(`Connection failed: ${res.status}`);
      }
    } catch (e) {
      setStatus(`Connection failed: ${e}`);
    }
  };

  const testLogin = async () => {
    try {
      const authData = await pb.collection('users').authWithPassword('sales@test.com', '12345678');
      setLoginResult(`Login success! User: ${authData.record.name} (${authData.record.type})`);
      pb.authStore.clear();
    } catch (e) {
      setLoginResult(`Login failed: ${e}`);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>PocketBase Test</h1>
      <button onClick={testConnection}>Test Connection</button>
      <p>{status}</p>
      <hr />
      <button onClick={testLogin}>Test Login (sales@test.com)</button>
      <p>{loginResult}</p>
    </div>
  );
};
