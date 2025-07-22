package model

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"one-api/common"
	"one-api/dto"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ChatLog represents detailed logging of LLM requests and responses
type ChatLog struct {
	ID          int64  `json:"id" gorm:"primary_key;AUTO_INCREMENT"`
	UserID      int    `json:"user_id" gorm:"index"`
	Username    string `json:"username" gorm:"index"`
	TokenID     int    `json:"token_id" gorm:"index"`
	TokenName   string `json:"token_name"`
	ModelName   string `json:"model_name" gorm:"index"`
	ChannelID   int    `json:"channel_id"`
	ChannelName string `json:"channel_name"`

	// Request information
	RequestType   string `json:"request_type"`                        // chat, completion, embedding, etc.
	PromptHash    string `json:"prompt_hash" gorm:"index"`            // For deduplication
	PromptContent string `json:"prompt_content" gorm:"type:longtext"` // Full prompt/messages
	SystemPrompt  string `json:"system_prompt" gorm:"type:text"`

	// Response information
	ResponseContent string `json:"response_content" gorm:"type:longtext"`
	ResponseChoices int    `json:"response_choices"`
	FinishReason    string `json:"finish_reason"`

	// Conversation tracking
	ConversationID     string `json:"conversation_id" gorm:"index"` // For tracking multiround chats
	MessageCount       int    `json:"message_count"`                // Number of messages in conversation
	IsMultiround       bool   `json:"is_multiround"`
	ConversationLength int    `json:"conversation_length"` // Total characters in conversation

	// Usage and performance
	PromptTokens     int  `json:"prompt_tokens"`
	CompletionTokens int  `json:"completion_tokens"`
	TotalTokens      int  `json:"total_tokens"`
	Quota            int  `json:"quota"`
	UseTimeSeconds   int  `json:"use_time_seconds"`
	IsStream         bool `json:"is_stream"`

	// Deduplication tracking
	DuplicateCount int   `json:"duplicate_count" gorm:"default:1"` // How many times this prompt was used
	FirstSeenAt    int64 `json:"first_seen_at" gorm:"bigint"`      // When this prompt was first seen
	LastSeenAt     int64 `json:"last_seen_at" gorm:"bigint"`       // Most recent usage

	// Metadata
	CreatedAt int64  `json:"created_at" gorm:"bigint;index"`
	RequestID string `json:"request_id" gorm:"index"`
	UserIP    string `json:"user_ip"`
	UserAgent string `json:"user_agent"`
	Other     string `json:"other" gorm:"type:text"` // Additional metadata as JSON
}

// ChatLogParams contains parameters for creating a chat log entry
type ChatLogParams struct {
	UserID         int
	Username       string
	TokenID        int
	TokenName      string
	ModelName      string
	ChannelID      int
	ChannelName    string
	RequestType    string
	RequestData    interface{} // Could be GeneralOpenAIRequest, etc.
	ResponseData   interface{} // Could be OpenAITextResponse, etc.
	Usage          *dto.Usage
	Quota          int
	UseTimeSeconds int
	IsStream       bool
	RequestID      string
	UserIP         string
	UserAgent      string
	Other          map[string]interface{}
}

// CreateChatLog creates a new chat log entry with deduplication and conversation tracking
func CreateChatLog(c *gin.Context, params ChatLogParams) error {
	// Extract prompt content and generate hash
	promptContent, systemPrompt, messageCount := extractPromptInfo(params.RequestData)
	promptHash := generatePromptHash(promptContent)

	// Generate or extract conversation ID
	conversationID := generateConversationID(c, params.RequestData)

	// Extract response content
	responseContent, responseChoices, finishReason := extractResponseInfo(params.ResponseData)

	// Calculate conversation metrics
	conversationLength := len(promptContent) + len(responseContent)
	isMultiround := messageCount > 1

	now := common.GetTimestamp()

	// Check for existing entry with same prompt hash for deduplication
	var existingLog ChatLog
	err := DB.Where("prompt_hash = ? AND user_id = ?", promptHash, params.UserID).First(&existingLog).Error

	if err == nil {
		// Update duplicate count and timestamp for existing prompt
		err = DB.Model(&existingLog).Updates(map[string]interface{}{
			"duplicate_count": gorm.Expr("duplicate_count + ?", 1),
			"last_seen_at":    now,
		}).Error
		if err != nil {
			common.LogError(c, fmt.Sprintf("Failed to update duplicate count for chat log: %v", err))
		}

		// Still create a new entry for this specific request, but mark it as duplicate
		// This allows us to track all usage while maintaining deduplication metrics
	} else if err != gorm.ErrRecordNotFound {
		common.LogError(c, fmt.Sprintf("Error checking for existing chat log: %v", err))
	}

	// Create new chat log entry
	chatLog := &ChatLog{
		UserID:             params.UserID,
		Username:           params.Username,
		TokenID:            params.TokenID,
		TokenName:          params.TokenName,
		ModelName:          params.ModelName,
		ChannelID:          params.ChannelID,
		ChannelName:        params.ChannelName,
		RequestType:        params.RequestType,
		PromptHash:         promptHash,
		PromptContent:      promptContent,
		SystemPrompt:       systemPrompt,
		ResponseContent:    responseContent,
		ResponseChoices:    responseChoices,
		FinishReason:       finishReason,
		ConversationID:     conversationID,
		MessageCount:       messageCount,
		IsMultiround:       isMultiround,
		ConversationLength: conversationLength,
		PromptTokens:       getTokenValue(params.Usage, "prompt"),
		CompletionTokens:   getTokenValue(params.Usage, "completion"),
		TotalTokens:        getTokenValue(params.Usage, "total"),
		Quota:              params.Quota,
		UseTimeSeconds:     params.UseTimeSeconds,
		IsStream:           params.IsStream,
		DuplicateCount:     1,
		FirstSeenAt:        now,
		LastSeenAt:         now,
		CreatedAt:          now,
		RequestID:          params.RequestID,
		UserIP:             params.UserIP,
		UserAgent:          params.UserAgent,
		Other:              common.MapToJsonStr(params.Other),
	}

	err = DB.Create(chatLog).Error
	if err != nil {
		common.LogError(c, fmt.Sprintf("Failed to create chat log: %v", err))
		return err
	}

	// Update conversation tracking - find longest chat for this conversation
	go updateConversationMetrics(conversationID, params.UserID)

	return nil
}

// generatePromptHash creates a hash of the prompt content for deduplication
func generatePromptHash(promptContent string) string {
	// Normalize the prompt by removing extra whitespace and converting to lowercase
	normalized := strings.ToLower(strings.TrimSpace(promptContent))
	normalized = strings.ReplaceAll(normalized, "\n", " ")
	normalized = strings.ReplaceAll(normalized, "\t", " ")
	// Remove multiple spaces
	for strings.Contains(normalized, "  ") {
		normalized = strings.ReplaceAll(normalized, "  ", " ")
	}

	hash := sha256.Sum256([]byte(normalized))
	return hex.EncodeToString(hash[:])
}

// generateConversationID creates or extracts conversation ID for tracking multiround chats
func generateConversationID(c *gin.Context, requestData interface{}) string {
	// Try to get conversation ID from context or headers
	if convID := c.GetString("conversation_id"); convID != "" {
		return convID
	}
	if convID := c.GetHeader("X-Conversation-ID"); convID != "" {
		return convID
	}

	// For now, generate a new conversation ID based on user and timestamp
	// In a real implementation, you might want to track this in sessions or use client-provided IDs
	userID := c.GetInt("id")
	timestamp := time.Now().Unix()
	return fmt.Sprintf("conv_%d_%d", userID, timestamp)
}

// extractPromptInfo extracts prompt content, system prompt, and message count from request data
func extractPromptInfo(requestData interface{}) (promptContent, systemPrompt string, messageCount int) {
	if requestData == nil {
		return "", "", 0
	}

	switch req := requestData.(type) {
	case *dto.GeneralOpenAIRequest:
		if req.Messages != nil {
			messageCount = len(req.Messages)
			var promptParts []string

			for _, msg := range req.Messages {
				if msg.Role == "system" {
					systemPrompt = extractMessageContent(msg)
				} else {
					content := extractMessageContent(msg)
					promptParts = append(promptParts, fmt.Sprintf("[%s]: %s", msg.Role, content))
				}
			}
			promptContent = strings.Join(promptParts, "\n")
		} else if req.Prompt != nil {
			promptContent = fmt.Sprintf("%v", req.Prompt)
			messageCount = 1
		}
	case *dto.ClaudeRequest:
		if req.Messages != nil {
			messageCount = len(req.Messages)
			var promptParts []string

			for _, msg := range req.Messages {
				if msg.Role == "system" {
					systemPrompt = extractClaudeMessageContent(msg)
				} else {
					content := extractClaudeMessageContent(msg)
					promptParts = append(promptParts, fmt.Sprintf("[%s]: %s", msg.Role, content))
				}
			}
			promptContent = strings.Join(promptParts, "\n")
		}
		if req.System != nil {
			if systemStr, ok := req.System.(string); ok {
				systemPrompt = systemStr
			}
		}
	default:
		// Try to marshal to JSON as fallback
		if data, err := json.Marshal(requestData); err == nil {
			promptContent = string(data)
			messageCount = 1
		}
	}

	return promptContent, systemPrompt, messageCount
}

// extractMessageContent extracts text content from a message
func extractMessageContent(msg dto.Message) string {
	switch content := msg.Content.(type) {
	case string:
		return content
	case []interface{}:
		var parts []string
		for _, part := range content {
			if partMap, ok := part.(map[string]interface{}); ok {
				if text, exists := partMap["text"]; exists {
					parts = append(parts, fmt.Sprintf("%v", text))
				}
			}
		}
		return strings.Join(parts, " ")
	default:
		return fmt.Sprintf("%v", content)
	}
}

// extractClaudeMessageContent extracts text content from a Claude message
func extractClaudeMessageContent(msg dto.ClaudeMessage) string {
	if msg.Content == nil {
		return ""
	}

	// Handle Content as interface{} - it could be string or slice
	switch content := msg.Content.(type) {
	case string:
		return content
	case []interface{}:
		var parts []string
		for _, item := range content {
			if contentMap, ok := item.(map[string]interface{}); ok {
				if contentType, exists := contentMap["type"]; exists && contentType == "text" {
					if text, textExists := contentMap["text"]; textExists {
						parts = append(parts, fmt.Sprintf("%v", text))
					}
				}
			}
		}
		return strings.Join(parts, " ")
	case []dto.ClaudeMediaMessage:
		var parts []string
		for _, content := range content {
			if content.Type == "text" && content.Text != nil {
				parts = append(parts, *content.Text)
			}
		}
		return strings.Join(parts, " ")
	default:
		// Try to parse as ClaudeMediaMessage array using the built-in method
		if mediaMessages, err := msg.ParseContent(); err == nil {
			var parts []string
			for _, content := range mediaMessages {
				if content.Type == "text" && content.Text != nil {
					parts = append(parts, *content.Text)
				}
			}
			return strings.Join(parts, " ")
		}
		// Fallback to string representation
		return fmt.Sprintf("%v", content)
	}
}

// extractResponseInfo extracts response content from response data
func extractResponseInfo(responseData interface{}) (content string, choices int, finishReason string) {
	if responseData == nil {
		return "", 0, ""
	}

	switch resp := responseData.(type) {
	case *dto.OpenAITextResponse:
		if len(resp.Choices) > 0 {
			choices = len(resp.Choices)
			content = extractMessageContent(resp.Choices[0].Message)
			finishReason = resp.Choices[0].FinishReason
		}
	case *dto.OpenAIEmbeddingResponse:
		choices = len(resp.Data)
		content = fmt.Sprintf("Embedding response with %d vectors", len(resp.Data))
	default:
		// Try to marshal to JSON as fallback
		if data, err := json.Marshal(responseData); err == nil {
			content = string(data)
			choices = 1
		}
	}

	return content, choices, finishReason
}

// getTokenValue safely extracts token values from usage
func getTokenValue(usage *dto.Usage, tokenType string) int {
	if usage == nil {
		return 0
	}

	switch tokenType {
	case "prompt":
		return usage.PromptTokens
	case "completion":
		return usage.CompletionTokens
	case "total":
		return usage.TotalTokens
	default:
		return 0
	}
}

// updateConversationMetrics updates metrics for conversation tracking
func updateConversationMetrics(conversationID string, userID int) {
	// Find all logs for this conversation
	var logs []ChatLog
	err := DB.Where("conversation_id = ? AND user_id = ?", conversationID, userID).
		Order("created_at DESC").Find(&logs).Error
	if err != nil {
		common.SysLog(fmt.Sprintf("Failed to find conversation logs: %v", err))
		return
	}

	if len(logs) <= 1 {
		return // Not a multiround conversation yet
	}

	// Find the longest conversation (most total content)
	maxLength := 0
	var longestLog *ChatLog

	for i := range logs {
		if logs[i].ConversationLength > maxLength {
			maxLength = logs[i].ConversationLength
			longestLog = &logs[i]
		}

		// Update all logs to mark as multiround
		if !logs[i].IsMultiround {
			DB.Model(&logs[i]).Update("is_multiround", true)
		}
	}

	// Update the longest conversation metric
	if longestLog != nil {
		DB.Model(longestLog).Update("conversation_length", maxLength)
	}
}

// GetChatLogsByUser retrieves chat logs for a specific user
func GetChatLogsByUser(userID int, limit, offset int) ([]ChatLog, int64, error) {
	var logs []ChatLog
	var total int64

	err := DB.Model(&ChatLog{}).Where("user_id = ?", userID).Count(&total).Error
	if err != nil {
		return nil, 0, err
	}

	err = DB.Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(limit).Offset(offset).
		Find(&logs).Error

	return logs, total, err
}

// GetDuplicatePrompts retrieves prompts with duplicate count > 1
func GetDuplicatePrompts(userID int, limit, offset int) ([]ChatLog, error) {
	var logs []ChatLog

	err := DB.Where("user_id = ? AND duplicate_count > 1", userID).
		Order("duplicate_count DESC, last_seen_at DESC").
		Limit(limit).Offset(offset).
		Find(&logs).Error

	return logs, err
}

// GetLongestChats retrieves the longest multiround conversations
func GetLongestChats(userID int, limit, offset int) ([]ChatLog, error) {
	var logs []ChatLog

	err := DB.Where("user_id = ? AND is_multiround = ?", userID, true).
		Order("conversation_length DESC, created_at DESC").
		Limit(limit).Offset(offset).
		Find(&logs).Error

	return logs, err
}
