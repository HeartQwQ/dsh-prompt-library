# 接口

Agent工具prompt_library与Client POST /plugins/dsh-prompt-library/api共用同一Host服务。

action：models读取真实渠道目录；preferences读取独立模型偏好；savePreferences保存follow或fixed(provider/model)；optimize处理draft、sessionId、requestId、currentModel、referenceIds(最多3条)、includeHistory；cancel取消匹配sessionId/requestId的活动请求。

普通请求返回{ok,value}或{ok:false,error}。optimize返回NDJSON：meta(实际模型/参考)、text(正文增量)、done(最终正文/修改说明)，失败返回error；取消/断连传递AbortSignal，无自动重试或模型切换。只消费text-delta，不展示reasoning，不执行工具。取消与超时依赖模型adapter响应AbortSignal；错误和不完整结果不可应用。

HTTP只接受回环、同源的JSON POST与x-dsh-prompt-library:1，限制请求大小。不输出凭据或上游原始错误。模型设置沿宿主configEditor保存，不读写凭据文件。

输入长度按保守上限和准备后的模型容量检查，不截断。默认请求截止时间120秒、输出上限不超过4096 token；模型目录必须包含指定模型。流终止必须为stop，截断或异常不能当成功。
