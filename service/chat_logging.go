package service

import (
	"fmt"
	"one-api/common"
	"one-api/dto"
	"one-api/model"
	relaycommon "one-api/relay/common"
	"strings"

	"github.com/gin-gonic/gin"
)

// LogChatInteraction logs detailed LLM request/response with deduplication and conversation tracking
func LogChatInteraction(c *gin.Context, relayInfo *relaycommon.RelayInfo, requestData interface{}, responseData interface{}, usage *dto.Usage, quota, useTimeSeconds int) {
	// Only proceed if detailed logging is enabled (could be controlled by a setting)
	if !shouldLogDetailedChat() {
		return
	}

	// Extract user information from context
	userID := c.GetInt("id")
	username := c.GetString("username")
	tokenID := c.GetInt("token_id")
	tokenName := c.GetString("token_name")
	channelID := c.GetInt("channel_id")
	channelName := c.GetString("channel_name")
	requestID := c.GetString(common.RequestIdKey)

	// Determine request type based on relay mode
	requestType := getRequestTypeFromRelayMode(relayInfo.RelayMode)

	// Prepare additional metadata
	other := make(map[string]interface{})
	other["relay_mode"] = relayInfo.RelayMode
	other["api_type"] = relayInfo.ApiType
	other["upstream_model"] = relayInfo.UpstreamModelName
	other["origin_model"] = relayInfo.OriginModelName
	if relayInfo.IsStream {
		other["stream"] = true
	}

	// Create chat log parameters
	params := model.ChatLogParams{
		UserID:         userID,
		Username:       username,
		TokenID:        tokenID,
		TokenName:      tokenName,
		ModelName:      relayInfo.OriginModelName,
		ChannelID:      channelID,
		ChannelName:    channelName,
		RequestType:    requestType,
		RequestData:    requestData,
		ResponseData:   responseData,
		Usage:          usage,
		Quota:          quota,
		UseTimeSeconds: useTimeSeconds,
		IsStream:       relayInfo.IsStream,
		RequestID:      requestID,
		UserIP:         c.ClientIP(),
		UserAgent:      c.GetHeader("User-Agent"),
		Other:          other,
	}

	// Create the chat log entry asynchronously to avoid blocking the response
	go func() {
		err := model.CreateChatLog(c, params)
		if err != nil {
			common.LogError(c, "Failed to create detailed chat log: "+err.Error())
		}
	}()
}

// shouldLogDetailedChat determines if detailed chat logging should be enabled
// This could be controlled by a system setting in the future
func shouldLogDetailedChat() bool {
	// For now, always return true. In the future, this could be:
	// - A system setting in the database
	// - An environment variable
	// - Per-user or per-token setting
	return true
}

// getRequestTypeFromRelayMode maps relay mode to a human-readable request type
func getRequestTypeFromRelayMode(relayMode int) string {
	// Map relay modes to request types based on constants from relay/constant package
	switch relayMode {
	case 1: // RelayModeChatCompletions
		return "chat"
	case 2: // RelayModeCompletions
		return "completion"
	case 3: // RelayModeEmbeddings
		return "embedding"
	case 4: // RelayModeModerations
		return "moderation"
	case 5: // RelayModeEdits
		return "edit"
	case 6: // RelayModeImagesGenerations
		return "image_generation"
	case 7: // RelayModeImagesEdits
		return "image_edit"
	case 8: // RelayModeAudioSpeech
		return "audio_speech"
	case 9: // RelayModeAudioTranscription
		return "audio_transcription"
	case 10: // RelayModeAudioTranslation
		return "audio_translation"
	case 11: // RelayModeRerank
		return "rerank"
	case 16: // RelayModeResponses
		return "responses"
	case 17: // RelayModeGemini
		return "gemini"
	default:
		return "unknown"
	}
}

// GetDetailedChatLogs provides an API to retrieve detailed chat logs for a user
func GetDetailedChatLogs(userID int, limit, offset int) ([]model.ChatLog, int64, error) {
	return model.GetChatLogsByUser(userID, limit, offset)
}

// GetDuplicatePrompts provides an API to retrieve prompts that have been duplicated
func GetDuplicatePrompts(userID int, limit, offset int) ([]model.ChatLog, error) {
	return model.GetDuplicatePrompts(userID, limit, offset)
}

// GetLongestConversations provides an API to retrieve the longest multiround conversations
func GetLongestConversations(userID int, limit, offset int) ([]model.ChatLog, error) {
	return model.GetLongestChats(userID, limit, offset)
}

// GetAllChatLogsAdmin provides admin access to all users' chat logs with filtering
func GetAllChatLogsAdmin(limit, offset int, conditions []string, args []interface{}) ([]model.ChatLog, int64, error) {
	var logs []model.ChatLog
	var total int64

	// Build the base query
	query := model.DB.Model(&model.ChatLog{})

	// Apply filters
	if len(conditions) > 0 {
		whereClause := strings.Join(conditions, " AND ")
		query = query.Where(whereClause, args...)
	}

	// Get total count
	err := query.Count(&total).Error
	if err != nil {
		return nil, 0, err
	}

	// Get paginated results
	err = query.Order("created_at DESC").
		Limit(limit).Offset(offset).
		Find(&logs).Error

	return logs, total, err
}

// GetChatLogStats provides statistics about chat logs for admin dashboard
func GetChatLogStats(startTime, endTime int64) (map[string]interface{}, error) {
	stats := make(map[string]interface{})

	// Base query with time filtering
	query := model.DB.Model(&model.ChatLog{})
	if startTime > 0 {
		query = query.Where("created_at >= ?", startTime)
	}
	if endTime > 0 {
		query = query.Where("created_at <= ?", endTime)
	}

	// Total logs count
	var totalLogs int64
	err := query.Count(&totalLogs).Error
	if err != nil {
		return nil, err
	}
	stats["total_logs"] = totalLogs

	// Unique users count
	var uniqueUsers int64
	err = query.Distinct("user_id").Count(&uniqueUsers).Error
	if err != nil {
		return nil, err
	}
	stats["unique_users"] = uniqueUsers

	// Total tokens used
	var tokenStats struct {
		TotalPromptTokens     int64
		TotalCompletionTokens int64
		TotalTokens           int64
	}
	err = query.Select("SUM(prompt_tokens) as total_prompt_tokens, SUM(completion_tokens) as total_completion_tokens, SUM(total_tokens) as total_tokens").Scan(&tokenStats).Error
	if err != nil {
		return nil, err
	}
	stats["total_prompt_tokens"] = tokenStats.TotalPromptTokens
	stats["total_completion_tokens"] = tokenStats.TotalCompletionTokens
	stats["total_tokens"] = tokenStats.TotalTokens

	// Most popular models
	type ModelStat struct {
		ModelName string
		Count     int64
	}
	var modelStats []ModelStat
	err = query.Select("model_name, COUNT(*) as count").
		Group("model_name").
		Order("count DESC").
		Limit(10).
		Scan(&modelStats).Error
	if err != nil {
		return nil, err
	}
	stats["popular_models"] = modelStats

	// Request type distribution
	type RequestTypeStat struct {
		RequestType string
		Count       int64
	}
	var requestTypeStats []RequestTypeStat
	err = query.Select("request_type, COUNT(*) as count").
		Group("request_type").
		Order("count DESC").
		Scan(&requestTypeStats).Error
	if err != nil {
		return nil, err
	}
	stats["request_types"] = requestTypeStats

	// Duplicate prompts count
	var duplicatePrompts int64
	err = query.Where("duplicate_count > 1").Count(&duplicatePrompts).Error
	if err != nil {
		return nil, err
	}
	stats["duplicate_prompts"] = duplicatePrompts

	// Multiround conversations count
	var multiRoundConversations int64
	err = query.Where("is_multiround = ?", true).Count(&multiRoundConversations).Error
	if err != nil {
		return nil, err
	}
	stats["multiround_conversations"] = multiRoundConversations

	// Average conversation length
	var avgConversationLength float64
	err = query.Where("is_multiround = ?", true).
		Select("AVG(conversation_length)").
		Scan(&avgConversationLength).Error
	if err != nil {
		return nil, err
	}
	stats["avg_conversation_length"] = avgConversationLength

	// Top users by activity
	type UserStat struct {
		UserID   int
		Username string
		Count    int64
	}
	var userStats []UserStat
	err = query.Select("user_id, username, COUNT(*) as count").
		Group("user_id, username").
		Order("count DESC").
		Limit(10).
		Scan(&userStats).Error
	if err != nil {
		return nil, err
	}
	stats["top_users"] = userStats

	// Most duplicated models by request type
	type DuplicateModelStat struct {
		ModelName   string
		RequestType string
		Count       int64
	}
	var duplicateModelStats []DuplicateModelStat
	err = query.Select("model_name, request_type, COUNT(*) as count").
		Where("duplicate_count > 1").
		Group("model_name, request_type").
		Order("count DESC").
		Limit(10).
		Scan(&duplicateModelStats).Error
	if err != nil {
		return nil, err
	}
	stats["most_duplicated_models"] = duplicateModelStats

	return stats, nil
}

// DeleteChatLogsAdmin deletes chat logs with filtering (admin only)
func DeleteChatLogsAdmin(conditions []string, args []interface{}) (int64, error) {
	if len(conditions) == 0 {
		return 0, fmt.Errorf("no conditions specified for deletion")
	}

	// Build the delete query
	query := model.DB.Model(&model.ChatLog{})
	whereClause := strings.Join(conditions, " AND ")

	result := query.Where(whereClause, args...).Delete(&model.ChatLog{})
	if result.Error != nil {
		return 0, result.Error
	}

	return result.RowsAffected, nil
}
