package controller

import (
	"net/http"
	"one-api/common"
	"one-api/service"
	"strconv"

	"github.com/gin-gonic/gin"
)

// GetChatLogs retrieves detailed chat logs for the authenticated user
func GetChatLogs(c *gin.Context) {
	userID := c.GetInt("id")

	// Parse query parameters
	limitStr := c.DefaultQuery("limit", "20")
	offsetStr := c.DefaultQuery("offset", "0")

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 || limit > 100 {
		limit = 20
	}

	offset, err := strconv.Atoi(offsetStr)
	if err != nil || offset < 0 {
		offset = 0
	}

	// Get chat logs
	logs, total, err := service.GetDetailedChatLogs(userID, limit, offset)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"logs":   logs,
			"total":  total,
			"limit":  limit,
			"offset": offset,
		},
	})
}

// GetDuplicatePrompts retrieves prompts that have been used multiple times
func GetDuplicatePrompts(c *gin.Context) {
	userID := c.GetInt("id")

	// Parse query parameters
	limitStr := c.DefaultQuery("limit", "20")
	offsetStr := c.DefaultQuery("offset", "0")

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 || limit > 100 {
		limit = 20
	}

	offset, err := strconv.Atoi(offsetStr)
	if err != nil || offset < 0 {
		offset = 0
	}

	// Get duplicate prompts
	logs, err := service.GetDuplicatePrompts(userID, limit, offset)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"logs":   logs,
			"limit":  limit,
			"offset": offset,
		},
	})
}

// GetLongestConversations retrieves the longest multiround conversations
func GetLongestConversations(c *gin.Context) {
	userID := c.GetInt("id")

	// Parse query parameters
	limitStr := c.DefaultQuery("limit", "20")
	offsetStr := c.DefaultQuery("offset", "0")

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 || limit > 100 {
		limit = 20
	}

	offset, err := strconv.Atoi(offsetStr)
	if err != nil || offset < 0 {
		offset = 0
	}

	// Get longest conversations
	logs, err := service.GetLongestConversations(userID, limit, offset)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"logs":   logs,
			"limit":  limit,
			"offset": offset,
		},
	})
}
