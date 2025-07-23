import React, { useEffect, useState } from 'react';
import {
  Layout,
  Card,
  Form,
  Button,
  Table,
  Space,
  Toast,
  Input,
  Select,
  DatePicker,
  Typography,
  Modal,
  Badge,
  Tooltip,
  Popconfirm,
  Row,
  Col
} from '@douyinfe/semi-ui';
import { API } from '../../helpers';
import { showError, showSuccess, timestamp2string } from '../../helpers';
import { 
  Download, 
  Search, 
  Filter, 
  Trash2, 
  BarChart3,
  Users,
  MessageSquare,
  RefreshCw,
  Database
} from 'lucide-react';

const { Content } = Layout;
const { Title, Text } = Typography;

const ChatLogsAdmin = () => {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState({});
  const [searchForm] = Form.useForm();
  const [stats, setStats] = useState({});
  const [showStats, setShowStats] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
      width: 120,
      render: (text, record) => (
        <div>
          <div>{text}</div>
          <Text size="small" type="quaternary">ID: {record.user_id}</Text>
        </div>
      ),
    },
    {
      title: '模型',
      dataIndex: 'model_name',
      key: 'model_name',
      width: 140,
      render: (text, record) => (
        <div>
          <div>{text}</div>
          <Badge 
            count={record.request_type} 
            type="secondary" 
            size="small"
            style={{ fontSize: '10px' }}
          />
        </div>
      ),
    },
    {
      title: '提示内容',
      dataIndex: 'prompt_content',
      key: 'prompt_content',
      ellipsis: {
        showTitle: false,
      },
      render: (text) => (
        <Tooltip content={text} style={{ maxWidth: '400px' }}>
          <div style={{ 
            maxWidth: '200px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {text}
          </div>
        </Tooltip>
      ),
    },
    {
      title: '响应内容',
      dataIndex: 'response_content',
      key: 'response_content',
      ellipsis: {
        showTitle: false,
      },
      render: (text) => (
        <Tooltip content={text} style={{ maxWidth: '400px' }}>
          <div style={{ 
            maxWidth: '200px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {text}
          </div>
        </Tooltip>
      ),
    },
    {
      title: 'Token使用',
      key: 'tokens',
      width: 120,
      render: (record) => (
        <div>
          <Text size="small">输入: {record.prompt_tokens}</Text>
          <br />
          <Text size="small">输出: {record.completion_tokens}</Text>
          <br />
          <Text size="small" type="success">总计: {record.total_tokens}</Text>
        </div>
      ),
    },
    {
      title: '会话信息',
      key: 'conversation',
      width: 120,
      render: (record) => (
        <div>
          <div>
            <Badge 
              dot={record.is_multiround} 
              type={record.is_multiround ? 'success' : 'secondary'}
            >
              消息数: {record.message_count}
            </Badge>
          </div>
          {record.duplicate_count > 1 && (
            <Text size="small" type="warning">
              重复 {record.duplicate_count} 次
            </Text>
          )}
        </div>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (text) => timestamp2string(text),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (record) => (
        <Space>
          <Popconfirm
            title="确认删除"
            content="确定要删除这条聊天记录吗？"
            onConfirm={() => deleteSingleLog(record.id)}
          >
            <Button 
              type="danger" 
              size="small" 
              icon={<Trash2 size={14} />}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: setSelectedRowKeys,
  };

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [currentPage, pageSize, filters]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
        ...filters,
      });
      
      const res = await API.get(`/api/admin/chat-logs?${params}`);
      const { success, data, message } = res.data;
      if (success) {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
      } else {
        showError(message);
      }
    } catch (error) {
      showError('获取聊天日志失败: ' + error.message);
    }
    setLoading(false);
  };

  const fetchStats = async () => {
    try {
      const res = await API.get('/api/admin/chat-logs/stats');
      const { success, data, message } = res.data;
      if (success) {
        setStats(data);
      } else {
        showError(message);
      }
    } catch (error) {
      showError('获取统计信息失败: ' + error.message);
    }
  };

  const handleSearch = (values) => {
    const newFilters = {};
    Object.keys(values).forEach(key => {
      if (values[key] !== undefined && values[key] !== '') {
        if (key === 'start_time' && values[key]) {
          newFilters.start_time = Math.floor(values[key].getTime() / 1000);
        } else if (key === 'end_time' && values[key]) {
          newFilters.end_time = Math.floor(values[key].getTime() / 1000);
        } else {
          newFilters[key] = values[key];
        }
      }
    });
    setFilters(newFilters);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    searchForm.reset();
    setFilters({});
    setCurrentPage(1);
  };

  const exportLogs = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        max_records: 50000,
        ...filters,
      });
      
      const response = await fetch(`/api/admin/chat-logs/export?${params}`, {
        method: 'GET',
        headers: {
          'Authorization': localStorage.getItem('token'),
        },
      });

      if (!response.ok) {
        throw new Error('导出失败');
      }

      // 创建下载链接
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat_logs_export_${new Date().toISOString().split('T')[0]}.jsonl`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      showSuccess('聊天日志导出成功');
    } catch (error) {
      showError('导出失败: ' + error.message);
    }
    setExporting(false);
  };

  const deleteLogs = async () => {
    if (Object.keys(filters).length === 0) {
      showError('请至少设置一个筛选条件再删除');
      return;
    }

    try {
      const params = new URLSearchParams(filters);
      const res = await API.delete(`/api/admin/chat-logs?${params}`);
      const { success, data, message } = res.data;
      if (success) {
        showSuccess(`成功删除 ${data.deleted_count} 条记录`);
        fetchLogs();
        fetchStats();
      } else {
        showError(message);
      }
    } catch (error) {
      showError('删除失败: ' + error.message);
    }
  };

  const deleteSingleLog = async (id) => {
    try {
      const res = await API.delete(`/api/admin/chat-logs?id=${id}`);
      const { success, data, message } = res.data;
      if (success) {
        showSuccess('删除成功');
        fetchLogs();
        fetchStats();
      } else {
        showError(message);
      }
    } catch (error) {
      showError('删除失败: ' + error.message);
    }
  };

  const requestTypeOptions = [
    { label: '聊天', value: 'chat' },
    { label: '补全', value: 'completion' },
    { label: '嵌入', value: 'embedding' },
    { label: '审核', value: 'moderation' },
    { label: '音频', value: 'audio_speech' },
    { label: '图像', value: 'image_generation' },
  ];

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <Title level={3}>聊天日志管理</Title>
        <Text type="secondary">查看、搜索、导出和管理所有用户的聊天记录</Text>
      </div>

      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: '20px' }}>
        <Col span={6}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={16} />
              <div>
                <Text type="secondary" size="small">总日志数</Text>
                <div>
                  <Text size="large" strong>{stats.total_logs || 0}</Text>
                </div>
              </div>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={16} />
              <div>
                <Text type="secondary" size="small">活跃用户</Text>
                <div>
                  <Text size="large" strong>{stats.unique_users || 0}</Text>
                </div>
              </div>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageSquare size={16} />
              <div>
                <Text type="secondary" size="small">多轮对话</Text>
                <div>
                  <Text size="large" strong>{stats.multiround_conversations || 0}</Text>
                </div>
              </div>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <RefreshCw size={16} />
              <div>
                <Text type="secondary" size="small">重复提示</Text>
                <div>
                  <Text size="large" strong>{stats.duplicate_prompts || 0}</Text>
                </div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 搜索表单 */}
      <Card style={{ marginBottom: '20px' }}>
        <Form
          form={searchForm}
          layout="horizontal"
          onSubmit={handleSearch}
          style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'end' }}
        >
          <Form.Input
            field="user_id"
            label="用户ID"
            placeholder="输入用户ID"
            style={{ width: 120 }}
          />
          <Form.Input
            field="model_name"
            label="模型名称"
            placeholder="输入模型名称"
            style={{ width: 150 }}
          />
          <Form.Select
            field="request_type"
            label="请求类型"
            placeholder="选择类型"
            options={requestTypeOptions}
            style={{ width: 120 }}
          />
          <Form.DatePicker
            field="start_time"
            label="开始时间"
            type="dateTime"
            style={{ width: 180 }}
          />
          <Form.DatePicker
            field="end_time"
            label="结束时间"
            type="dateTime"
            style={{ width: 180 }}
          />
          <Form.Input
            field="min_duplicate_count"
            label="最小重复次数"
            placeholder="如: 2"
            style={{ width: 120 }}
          />
          <Space>
            <Button 
              htmlType="submit" 
              type="primary" 
              icon={<Search size={16} />}
              loading={loading}
            >
              搜索
            </Button>
            <Button 
              onClick={clearFilters}
              icon={<Filter size={16} />}
            >
              清除筛选
            </Button>
          </Space>
        </Form>
      </Card>

      {/* 操作按钮 */}
      <Card style={{ marginBottom: '20px' }}>
        <Space>
          <Button
            type="primary"
            icon={<Download size={16} />}
            onClick={exportLogs}
            loading={exporting}
          >
            导出JSONL
          </Button>
          <Button
            icon={<BarChart3 size={16} />}
            onClick={() => setShowStats(true)}
          >
            查看统计
          </Button>
          <Popconfirm
            title="确认删除"
            content="确定要删除符合条件的聊天记录吗？此操作不可撤销。"
            onConfirm={deleteLogs}
          >
            <Button
              type="danger"
              icon={<Trash2 size={16} />}
              disabled={Object.keys(filters).length === 0}
            >
              批量删除
            </Button>
          </Popconfirm>
          <Button
            icon={<RefreshCw size={16} />}
            onClick={() => {
              fetchLogs();
              fetchStats();
            }}
          >
            刷新
          </Button>
        </Space>
      </Card>

      {/* 数据表格 */}
      <Card>
        <Table
          columns={columns}
          dataSource={logs}
          rowKey="id"
          loading={loading}
          pagination={{
            currentPage,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOpts: [10, 20, 50, 100],
            onPageChange: setCurrentPage,
            onPageSizeChange: (size) => {
              setPageSize(size);
              setCurrentPage(1);
            },
            showTotal: (total, range) => 
              `第 ${range[0]}-${range[1]} 条，共 ${total} 条记录`,
          }}
          rowSelection={rowSelection}
          scroll={{ x: 1400 }}
        />
      </Card>

      {/* 统计详情模态框 */}
      <Modal
        title="聊天日志统计"
        visible={showStats}
        onCancel={() => setShowStats(false)}
        footer={null}
        width={800}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Card title="基础统计">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <Text type="secondary" size="small">总日志数</Text>
                  <div>
                    <Text size="large" strong>{stats.total_logs || 0}</Text>
                  </div>
                </div>
                <div>
                  <Text type="secondary" size="small">活跃用户数</Text>
                  <div>
                    <Text size="large" strong>{stats.unique_users || 0}</Text>
                  </div>
                </div>
                <div>
                  <Text type="secondary" size="small">总Token数</Text>
                  <div>
                    <Text size="large" strong>{stats.total_tokens || 0}</Text>
                  </div>
                </div>
                <div>
                  <Text type="secondary" size="small">平均对话长度</Text>
                  <div>
                    <Text size="large" strong>{Math.round(stats.avg_conversation_length || 0)}</Text>
                  </div>
                </div>
              </div>
            </Card>
          </Col>
          <Col span={12}>
            <Card title="模型使用排行">
              {stats.popular_models?.slice(0, 5).map((model, index) => (
                <div key={model.model_name} style={{ marginBottom: '8px' }}>
                  <Text>{index + 1}. {model.model_name}</Text>
                  <Text type="quaternary" style={{ float: 'right' }}>
                    {model.count} 次
                  </Text>
                </div>
              ))}
            </Card>
          </Col>
        </Row>
      </Modal>
    </div>
  );
};

export default ChatLogsAdmin; 