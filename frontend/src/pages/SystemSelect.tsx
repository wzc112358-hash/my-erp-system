import { useNavigate } from 'react-router-dom';
import { Card, Button } from 'antd';
import './SystemSelect.css';

const SystemSelect = () => {
  const navigate = useNavigate();

  const handleSelectSystem = (system: 'beijing' | 'lanzhou') => {
    localStorage.setItem('erp_system', system);
    navigate('/login');
  };

  return (
    <div className="system-select-container">
      <h1 className="system-select-title">企业采购销售管理系统</h1>
      <div className="system-select-cards">
        <Card className="system-card">
          <h2>北京系统</h2>
          <p>北京企业采购销售管理系统</p>
          <Button
            type="primary"
            onClick={() => handleSelectSystem('beijing')}
            className="system-select-btn"
          >
            选择
          </Button>
        </Card>
        <Card className="system-card">
          <h2>兰州系统</h2>
          <p>兰州企业采购销售管理系统</p>
          <Button
            type="primary"
            onClick={() => handleSelectSystem('lanzhou')}
            className="system-select-btn"
          >
            选择
          </Button>
        </Card>
      </div>
    </div>
  );
};

export default SystemSelect;
