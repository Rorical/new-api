import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
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
  Col,
  Collapsible,
  Skeleton,
  Tag,
  Divider,
  Progress,
  Empty,
  SideSheet,
  Descriptions,
  Timeline,
  BackTop,
  Switch,
  AutoComplete
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
  Database,
  Eye,
  ChevronDown,
  ChevronUp,
  Calendar,
  Clock,
  User,
  Bot,
  Settings,
  TrendingUp,
  Activity,
  FileText,
  Copy,
  ExternalLink,
  Zap,
  AlertCircle,
  CheckCircle2,
  XCircle,
  PlayCircle,
  PauseCircle
} from 'lucide-react';

const { Content } = Layout;
const { Title, Text, Paragraph } = Typography;

const ChatLogsAdmin = () => {
  // State management
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState({});
  const [searchFormValues, setSearchFormValues] = useState({});
  const [stats, setStats] = useState({});
  const [showStats, setShowStats] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [viewingLog, setViewingLog] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [densityMode, setDensityMode] = useState('default'); // compact, default, comfortable

  // Refs
  const searchFormRef = useRef();
  const refreshTimerRef = useRef();

  // Debounced search
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useRef();

  useEffect(() => {
    clearTimeout(debouncedSearchTerm.current);
    debouncedSearchTerm.current = setTimeout(() => {
      if (searchTerm) {
        setFilters(prev => ({ ...prev, search: searchTerm }));
      } else {
        setFilters(prev => {
          const { search, ...rest } = prev;
          return rest;
        });
      }
    }, 500);
  }, [searchTerm]);

  // Auto refresh logic
  useEffect(() => {
    if (autoRefresh) {
      refreshTimerRef.current = setInterval(() => {
        fetchLogs();
        fetchStats();
      }, refreshInterval * 1000);
    } else {
      clearInterval(refreshTimerRef.current);
    }
    return () => clearInterval(refreshTimerRef.current);
  }, [autoRefresh, refreshInterval]);

  // Enhanced columns with better formatting
  const columns = useMemo(() => {
    const baseColumns = [
      {
        title: (
          <Space>
            <Database size={14} />
            ID
          </Space>
        ),
        dataIndex: 'id',
        key: 'id',
        width: 80,
        sorter: true,
        render: (text) => (
          <Badge count={text} type="tertiary" style={{ fontSize: '12px' }} />
        ),
      },
      {
        title: (
          <Space>
            <User size={14} />
            用户信息
          </Space>
        ),
        dataIndex: 'username',
        key: 'username',
        width: 140,
        render: (text, record) => (
          <div className="user-info">
            <div style={{ fontWeight: 600, marginBottom: '2px' }}>{text}</div>
            <Text size="small" type="quaternary">
              ID: {record.user_id} | {record.token_name}
            </Text>
            {record.user_ip && (
              <Text size="small" type="quaternary" style={{ display: 'block' }}>
                IP: {record.user_ip}
              </Text>
            )}
          </div>
        ),
      },
      {
        title: (
          <Space>
            <Bot size={14} />
            模型 & 类型
          </Space>
        ),
        dataIndex: 'model_name',
        key: 'model_name',
        width: 160,
        render: (text, record) => (
          <div>
            <div style={{ fontWeight: 500, marginBottom: '4px' }}>{text}</div>
            <Space>
              <Tag 
                color={getRequestTypeColor(record.request_type)}
                size="small"
              >
                {record.request_type}
              </Tag>
              {record.is_stream && (
                <Tag color="cyan" size="small">
                  <PlayCircle size={10} style={{ marginRight: '2px' }} />
                  流式
                </Tag>
              )}
            </Space>
          </div>
        ),
      },
      {
        title: (
          <Space>
            <MessageSquare size={14} />
            对话内容
          </Space>
        ),
        key: 'content',
        width: 300,
        render: (record) => (
          <div className="conversation-preview">
            <div style={{ marginBottom: '8px' }}>
              <Space size="small">
                <Tag color="blue" size="small">
                  <User size={10} style={{ marginRight: '2px' }} />
                  提示词
                </Tag>
                <Text size="small" type="quaternary">
                  {record.prompt_tokens} tokens
                </Text>
              </Space>
              <Paragraph 
                ellipsis={{ 
                  rows: 2, 
                  expandable: false,
                  showTooltip: { opts: { content: record.prompt_content } }
                }}
                style={{ 
                  margin: '4px 0', 
                  fontSize: '13px',
                  lineHeight: '1.4'
                }}
              >
                {record.prompt_content || '无内容'}
              </Paragraph>
            </div>
            
            {record.response_content && (
              <div>
                <Space size="small">
                  <Tag color="green" size="small">
                    <Bot size={10} style={{ marginRight: '2px' }} />
                    响应
                  </Tag>
                  <Text size="small" type="quaternary">
                    {record.completion_tokens} tokens
                  </Text>
                </Space>
                <Paragraph 
                  ellipsis={{ 
                    rows: 2, 
                    expandable: false,
                    showTooltip: { opts: { content: record.response_content } }
                  }}
                  style={{ 
                    margin: '4px 0', 
                    fontSize: '13px',
                    lineHeight: '1.4'
                  }}
                >
                  {record.response_content}
                </Paragraph>
              </div>
            )}
          </div>
        ),
      },
      {
        title: (
          <Space>
            <Activity size={14} />
            使用统计
          </Space>
        ),
        key: 'usage',
        width: 160,
        sorter: true,
        render: (record) => (
          <div className="usage-stats">
            <Row gutter={8}>
              <Col span={12}>
                <div style={{ textAlign: 'center', padding: '8px', backgroundColor: 'var(--semi-color-fill-0)', borderRadius: '4px' }}>
                  <Text size="small" type="quaternary">总 Token</Text>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--semi-color-success)' }}>
                    {record.total_tokens || 0}
                  </div>
                </div>
              </Col>
              <Col span={12}>
                <div style={{ textAlign: 'center', padding: '8px', backgroundColor: 'var(--semi-color-fill-0)', borderRadius: '4px' }}>
                  <Text size="small" type="quaternary">配额</Text>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--semi-color-primary)' }}>
                    {record.quota || 0}
                  </div>
                </div>
              </Col>
            </Row>
            <div style={{ marginTop: '8px' }}>
              <Progress 
                percent={record.completion_tokens / (record.total_tokens || 1) * 100}
                showInfo={false}
                size="small"
                stroke="var(--semi-color-warning)"
              />
              <Text size="small" type="quaternary">
                输入: {record.prompt_tokens} | 输出: {record.completion_tokens}
              </Text>
            </div>
          </div>
        ),
      },
      {
        title: (
          <Space>
            <MessageSquare size={14} />
            会话信息
          </Space>
        ),
        key: 'conversation',
        width: 140,
        render: (record) => (
          <div className="conversation-info">
            <Space direction="vertical" spacing="small">
              <div>
                <Badge 
                  dot={record.is_multiround} 
                  type={record.is_multiround ? 'success' : 'secondary'}
                >
                  <Text size="small">
                    {record.message_count} 消息
                  </Text>
                </Badge>
              </div>
              
              {record.duplicate_count > 1 && (
                <Tag color="orange" size="small">
                  <RefreshCw size={10} style={{ marginRight: '2px' }} />
                  重复 {record.duplicate_count}x
                </Tag>
              )}
              
              {record.conversation_length > 0 && (
                <Text size="small" type="quaternary">
                  长度: {record.conversation_length}
                </Text>
              )}
              
              {record.finish_reason && (
                <Tag 
                  color={getFinishReasonColor(record.finish_reason)}
                  size="small"
                >
                  {getFinishReasonIcon(record.finish_reason)}
                  {record.finish_reason}
                </Tag>
              )}
            </Space>
          </div>
        ),
      },
      {
        title: (
          <Space>
            <Clock size={14} />
            时间信息
          </Space>
        ),
        key: 'timing',
        width: 160,
        sorter: true,
        render: (record) => (
          <div className="timing-info">
            <div style={{ marginBottom: '4px' }}>
              <Text size="small" type="quaternary">创建时间</Text>
              <div style={{ fontWeight: 500 }}>
                {timestamp2string(record.created_at)}
              </div>
            </div>
            {record.use_time_seconds > 0 && (
              <div>
                <Text size="small" type="quaternary">耗时</Text>
                <div>
                  <Tag color="blue" size="small">
                    <Zap size={10} style={{ marginRight: '2px' }} />
                    {record.use_time_seconds}s
                  </Tag>
                </div>
              </div>
            )}
          </div>
        ),
      },
      {
        title: '操作',
        key: 'action',
        width: 120,
        fixed: 'right',
        render: (record) => (
          <Space>
            <Tooltip content="查看详情">
              <Button 
                type="tertiary" 
                size="small" 
                icon={<Eye size={14} />}
                onClick={() => setViewingLog(record)}
              />
            </Tooltip>
            <Tooltip content="复制内容">
              <Button 
                type="tertiary" 
                size="small" 
                icon={<Copy size={14} />}
                onClick={() => copyLogContent(record)}
              />
            </Tooltip>
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

    // Adjust column widths based on density mode
    if (densityMode === 'compact') {
      return baseColumns.map(col => ({
        ...col,
        width: col.width ? Math.floor(col.width * 0.8) : col.width
      }));
    } else if (densityMode === 'comfortable') {
      return baseColumns.map(col => ({
        ...col,
        width: col.width ? Math.floor(col.width * 1.2) : col.width
      }));
    }

    return baseColumns;
  }, [densityMode]);

  const rowSelection = {
    selectedRowKeys,
    onChange: setSelectedRowKeys,
    getCheckboxProps: (record) => ({
      name: record.id,
    }),
  };

  // Helper functions
  const getRequestTypeColor = (type) => {
    const colors = {
      'chat': 'blue',
      'completion': 'green',
      'embedding': 'purple',
      'image_generation': 'orange',
      'audio_speech': 'cyan',
      'rerank': 'pink'
    };
    return colors[type] || 'grey';
  };

  const getFinishReasonColor = (reason) => {
    const colors = {
      'stop': 'green',
      'length': 'orange',
      'tool_calls': 'blue',
      'content_filter': 'red'
    };
    return colors[reason] || 'grey';
  };

  const getFinishReasonIcon = (reason) => {
    const icons = {
      'stop': <CheckCircle2 size={10} style={{ marginRight: '2px' }} />,
      'length': <AlertCircle size={10} style={{ marginRight: '2px' }} />,
      'tool_calls': <Settings size={10} style={{ marginRight: '2px' }} />,
      'content_filter': <XCircle size={10} style={{ marginRight: '2px' }} />
    };
    return icons[reason] || null;
  };

  const copyLogContent = useCallback(async (record) => {
    const content = `用户: ${record.username}\n模型: ${record.model_name}\n提示: ${record.prompt_content}\n响应: ${record.response_content}`;
    try {
      await navigator.clipboard.writeText(content);
      showSuccess('内容已复制到剪贴板');
    } catch (err) {
      showError('复制失败');
    }
  }, []);

  // Data fetching functions
  const fetchLogs = useCallback(async () => {
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
  }, [currentPage, pageSize, filters]);

  const fetchStats = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [fetchLogs, fetchStats]);

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
    if (searchFormRef.current) {
      searchFormRef.current.reset();
    }
    setSearchFormValues({});
    setFilters({});
    setSearchTerm('');
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
    if (Object.keys(filters).length === 0 && selectedRowKeys.length === 0) {
      showError('请至少设置一个筛选条件或选择记录再删除');
      return;
    }

    try {
      let params;
      if (selectedRowKeys.length > 0) {
        params = new URLSearchParams({ id: selectedRowKeys.join(',') });
      } else {
        params = new URLSearchParams(filters);
      }
      
      const res = await API.delete(`/api/admin/chat-logs?${params}`);
      const { success, data, message } = res.data;
      if (success) {
        showSuccess(`成功删除 ${data.deleted_count} 条记录`);
        setSelectedRowKeys([]);
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
    { label: '重排序', value: 'rerank' },
  ];

  const densityOptions = [
    { label: '紧凑', value: 'compact' },
    { label: '默认', value: 'default' },
    { label: '舒适', value: 'comfortable' }
  ];

  return (
    <div style={{ padding: '24px', background: 'var(--semi-color-bg-1)', minHeight: '100vh' }}>
      {/* Header Section */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <Title level={2} style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Database size={24} />
              聊天日志管理
            </Title>
            <Text type="secondary" style={{ fontSize: '14px' }}>
              查看、搜索、导出和管理所有用户的聊天记录 • 共 {total} 条记录
            </Text>
          </div>
          
          <Space>
            <Space size="small">
              <Text size="small">自动刷新</Text>
              <Switch 
                checked={autoRefresh} 
                onChange={setAutoRefresh}
                size="small"
              />
              {autoRefresh && (
                <Select
                  value={refreshInterval}
                  onChange={setRefreshInterval}
                  style={{ width: '80px' }}
                  size="small"
                >
                  <Select.Option value={10}>10s</Select.Option>
                  <Select.Option value={30}>30s</Select.Option>
                  <Select.Option value={60}>60s</Select.Option>
                </Select>
              )}
            </Space>
            
            <Select
              value={densityMode}
              onChange={setDensityMode}
              options={densityOptions}
              style={{ width: '100px' }}
              size="small"
              prefix={<Settings size={14} />}
            />
          </Space>
        </div>

        {/* Enhanced Statistics Cards */}
        <Row gutter={16}>
          <Col span={6}>
            <Card 
              style={{ 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                color: 'white'
              }}
              bodyStyle={{ padding: '20px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>总日志数</div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{stats.total_logs || 0}</div>
                </div>
                <Database size={32} style={{ opacity: 0.8 }} />
              </div>
            </Card>
          </Col>
          <Col span={6}>
            <Card 
              style={{ 
                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                border: 'none',
                color: 'white'
              }}
              bodyStyle={{ padding: '20px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>活跃用户</div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{stats.unique_users || 0}</div>
                </div>
                <Users size={32} style={{ opacity: 0.8 }} />
              </div>
            </Card>
          </Col>
          <Col span={6}>
            <Card 
              style={{ 
                background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                border: 'none',
                color: 'white'
              }}
              bodyStyle={{ padding: '20px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>多轮对话</div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{stats.multiround_conversations || 0}</div>
                </div>
                <MessageSquare size={32} style={{ opacity: 0.8 }} />
              </div>
            </Card>
          </Col>
          <Col span={6}>
            <Card 
              style={{ 
                background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
                border: 'none',
                color: 'white'
              }}
              bodyStyle={{ padding: '20px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>重复提示</div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{stats.duplicate_prompts || 0}</div>
                </div>
                <RefreshCw size={32} style={{ opacity: 0.8 }} />
              </div>
            </Card>
          </Col>
        </Row>
      </div>

      {/* Enhanced Search Section */}
      <Card style={{ marginBottom: '20px' }}>
        <div style={{ marginBottom: '16px' }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space>
              <Search size={16} />
              <Text weight="medium">搜索与筛选</Text>
            </Space>
            <Button
              type="tertiary"
              icon={showAdvancedSearch ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
              size="small"
            >
              {showAdvancedSearch ? '收起高级搜索' : '展开高级搜索'}
            </Button>
          </Space>
        </div>

        {/* Quick Search */}
        <div style={{ marginBottom: '16px' }}>
          <Input
            placeholder="快速搜索用户名、模型名称或内容..."
            value={searchTerm}
            onChange={setSearchTerm}
            prefix={<Search size={16} />}
            style={{ width: '100%' }}
            size="large"
          />
        </div>

        {/* Advanced Search */}
        <Collapsible isOpen={showAdvancedSearch}>
          <Divider style={{ margin: '16px 0' }} />
          <Form
            values={searchFormValues}
            getFormApi={(formApi) => (searchFormRef.current = formApi)}
            onSubmit={handleSearch}
          >
            <Row gutter={16}>
              <Col span={6}>
                <Form.Input
                  field="user_id"
                  label="用户ID"
                  placeholder="输入用户ID"
                />
              </Col>
              <Col span={6}>
                <Form.Input
                  field="model_name"
                  label="模型名称"
                  placeholder="输入模型名称"
                />
              </Col>
              <Col span={6}>
                <Form.Select
                  field="request_type"
                  label="请求类型"
                  placeholder="选择类型"
                  options={requestTypeOptions}
                />
              </Col>
              <Col span={6}>
                <Form.Input
                  field="min_duplicate_count"
                  label="最小重复次数"
                  placeholder="如: 2"
                />
              </Col>
            </Row>
            
            <Row gutter={16} style={{ marginTop: '16px' }}>
              <Col span={8}>
                <Form.DatePicker
                  field="start_time"
                  label="开始时间"
                  type="dateTime"
                  style={{ width: '100%' }}
                />
              </Col>
              <Col span={8}>
                <Form.DatePicker
                  field="end_time"
                  label="结束时间"
                  type="dateTime"
                  style={{ width: '100%' }}
                />
              </Col>
              <Col span={8}>
                <div style={{ paddingTop: '30px' }}>
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
                </div>
              </Col>
            </Row>
          </Form>
        </Collapsible>
      </Card>

      {/* Enhanced Action Bar */}
      <Card style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <Text type="secondary">
              {selectedRowKeys.length > 0 ? `已选择 ${selectedRowKeys.length} 条记录` : ''}
            </Text>
          </Space>
          
          <Space>
            <Button
              type="primary"
              icon={<Download size={16} />}
              onClick={exportLogs}
              loading={exporting}
            >
              导出数据
            </Button>
            
            <Button
              icon={<BarChart3 size={16} />}
              onClick={() => setShowStats(true)}
            >
              查看统计
            </Button>
            
            <Popconfirm
              title="确认删除"
              content={`确定要删除${selectedRowKeys.length > 0 ? '选中的' : '符合条件的'}聊天记录吗？此操作不可撤销。`}
              onConfirm={deleteLogs}
              disabled={Object.keys(filters).length === 0 && selectedRowKeys.length === 0}
            >
              <Button
                type="danger"
                icon={<Trash2 size={16} />}
                disabled={Object.keys(filters).length === 0 && selectedRowKeys.length === 0}
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
              loading={loading}
            >
              刷新
            </Button>
          </Space>
        </div>
      </Card>

      {/* Enhanced Data Table */}
      <Card style={{ overflow: 'hidden' }}>
        {loading && logs.length === 0 ? (
          <div>
            <Skeleton placeholder={<Skeleton.Title />} loading={true}>
              <div style={{ height: '50px' }} />
            </Skeleton>
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} placeholder={<Skeleton.Paragraph rows={3} />} loading={true} style={{ marginBottom: '16px' }}>
                <div style={{ height: '80px' }} />
              </Skeleton>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <Empty
            image={<Database size={64} />}
            title="暂无聊天日志"
            description="当前筛选条件下没有找到相关的聊天记录"
          />
        ) : (
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
              position: 'bottom',
            }}
            rowSelection={rowSelection}
            scroll={{ x: 1600 }}
            size={densityMode}
            style={{
              '--semi-table-header-bg': 'var(--semi-color-fill-0)',
              '--semi-table-row-hover-bg': 'var(--semi-color-fill-0)',
            }}
          />
        )}
      </Card>

      {/* Log Detail Modal */}
      {viewingLog && (
        <SideSheet
          title={
            <Space>
              <FileText size={20} />
              聊天记录详情
            </Space>
          }
          visible={!!viewingLog}
          onCancel={() => setViewingLog(null)}
          width={800}
          placement="right"
        >
          <div style={{ padding: '8px 0' }}>
            <Descriptions
              data={[
                { key: '用户信息', value: `${viewingLog.username} (ID: ${viewingLog.user_id})` },
                { key: '模型', value: viewingLog.model_name },
                { key: '请求类型', value: viewingLog.request_type },
                { key: '创建时间', value: timestamp2string(viewingLog.created_at) },
                { key: 'Token使用', value: `总计: ${viewingLog.total_tokens} (输入: ${viewingLog.prompt_tokens}, 输出: ${viewingLog.completion_tokens})` },
                { key: '配额消耗', value: viewingLog.quota },
                { key: '是否流式', value: viewingLog.is_stream ? '是' : '否' },
                { key: '消息数量', value: viewingLog.message_count },
                { key: '对话长度', value: viewingLog.conversation_length },
                { key: '重复次数', value: viewingLog.duplicate_count },
              ]}
              row
            />
            
            <Divider />
            
            <Title level={4}>对话内容</Title>
            <Timeline>
              <Timeline.Item
                time="用户提示"
                type="primary"
                dot={<User size={14} />}
              >
                <Card style={{ marginTop: '8px' }}>
                  <Paragraph copyable>
                    {viewingLog.prompt_content || '无内容'}
                  </Paragraph>
                </Card>
              </Timeline.Item>
              
              {viewingLog.response_content && (
                <Timeline.Item
                  time="AI响应"
                  type="success"
                  dot={<Bot size={14} />}
                >
                  <Card style={{ marginTop: '8px' }}>
                    <Paragraph copyable>
                      {viewingLog.response_content}
                    </Paragraph>
                  </Card>
                </Timeline.Item>
              )}
            </Timeline>
          </div>
        </SideSheet>
      )}

      {/* Enhanced Statistics Modal */}
      <Modal
        title={
          <Space>
            <TrendingUp size={20} />
            聊天日志统计分析
          </Space>
        }
        visible={showStats}
        onCancel={() => setShowStats(false)}
        footer={null}
        width={1000}
      >
        <Row gutter={24}>
          <Col span={12}>
            <Card title="基础统计" style={{ marginBottom: '16px' }}>
              <Space direction="vertical" spacing="large" style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text>总日志数</Text>
                  <Text strong style={{ fontSize: '18px' }}>{stats.total_logs || 0}</Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text>活跃用户数</Text>
                  <Text strong style={{ fontSize: '18px' }}>{stats.unique_users || 0}</Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text>总Token数</Text>
                  <Text strong style={{ fontSize: '18px' }}>{stats.total_tokens || 0}</Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text>平均对话长度</Text>
                  <Text strong style={{ fontSize: '18px' }}>{Math.round(stats.avg_conversation_length || 0)}</Text>
                </div>
              </Space>
            </Card>
          </Col>
          
          <Col span={12}>
            <Card title="热门模型排行" style={{ marginBottom: '16px' }}>
              <Space direction="vertical" spacing="small" style={{ width: '100%' }}>
                {stats.popular_models?.slice(0, 5).map((model, index) => (
                  <div key={model.model_name} style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: index < 4 ? '1px solid var(--semi-color-border)' : 'none'
                  }}>
                    <Space>
                      <Badge count={index + 1} type="primary" />
                      <Text>{model.model_name}</Text>
                    </Space>
                    <Tag color="blue">{model.count} 次</Tag>
                  </div>
                ))}
              </Space>
            </Card>
          </Col>
        </Row>
        
        <Row gutter={24}>
          <Col span={12}>
            <Card title="请求类型分布">
              <Space direction="vertical" spacing="small" style={{ width: '100%' }}>
                {stats.request_types?.map((type, index) => (
                  <div key={type.request_type} style={{ marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <Text>{type.request_type}</Text>
                      <Text>{type.count} 次</Text>
                    </div>
                    <Progress 
                      percent={type.count / (stats.total_logs || 1) * 100}
                      showInfo={false}
                      stroke={getRequestTypeColor(type.request_type)}
                    />
                  </div>
                ))}
              </Space>
            </Card>
          </Col>
          
          <Col span={12}>
            <Card title="活跃用户排行">
              <Space direction="vertical" spacing="small" style={{ width: '100%' }}>
                {stats.top_users?.slice(0, 5).map((user, index) => (
                  <div key={user.user_id} style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: index < 4 ? '1px solid var(--semi-color-border)' : 'none'
                  }}>
                    <Space>
                      <Badge count={index + 1} type="success" />
                      <Text>{user.username}</Text>
                      <Text type="quaternary" size="small">(ID: {user.user_id})</Text>
                    </Space>
                    <Tag color="green">{user.count} 次</Tag>
                  </div>
                ))}
              </Space>
            </Card>
          </Col>
        </Row>
      </Modal>

      <BackTop style={{ right: '50px' }} />
    </div>
  );
};

export default ChatLogsAdmin; 