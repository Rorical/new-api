package controller

import (
	"encoding/json"
	"fmt"
	"net/http"
	"one-api/common"
	"one-api/service"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// AdminGetAllChatLogs retrieves all chat logs across all users (admin only)
func AdminGetAllChatLogs(c *gin.Context) {
	// Parse query parameters
	limitStr := c.DefaultQuery("limit", "50")
	offsetStr := c.DefaultQuery("offset", "0")
	userIDStr := c.Query("user_id")
	modelName := c.Query("model_name")
	requestType := c.Query("request_type")
	startTimeStr := c.Query("start_time")
	endTimeStr := c.Query("end_time")
	conversationID := c.Query("conversation_id")
	minDuplicateCountStr := c.Query("min_duplicate_count")

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 || limit > 1000 {
		limit = 50
	}

	offset, err := strconv.Atoi(offsetStr)
	if err != nil || offset < 0 {
		offset = 0
	}

	// Build query conditions
	var conditions []string
	var args []interface{}

	if userIDStr != "" {
		if userID, err := strconv.Atoi(userIDStr); err == nil {
			conditions = append(conditions, "user_id = ?")
			args = append(args, userID)
		}
	}

	if modelName != "" {
		conditions = append(conditions, "model_name LIKE ?")
		args = append(args, "%"+modelName+"%")
	}

	if requestType != "" {
		conditions = append(conditions, "request_type = ?")
		args = append(args, requestType)
	}

	if conversationID != "" {
		conditions = append(conditions, "conversation_id = ?")
		args = append(args, conversationID)
	}

	if minDuplicateCountStr != "" {
		if minCount, err := strconv.Atoi(minDuplicateCountStr); err == nil && minCount > 0 {
			conditions = append(conditions, "duplicate_count >= ?")
			args = append(args, minCount)
		}
	}

	if startTimeStr != "" {
		if startTime, err := strconv.ParseInt(startTimeStr, 10, 64); err == nil {
			conditions = append(conditions, "created_at >= ?")
			args = append(args, startTime)
		}
	}

	if endTimeStr != "" {
		if endTime, err := strconv.ParseInt(endTimeStr, 10, 64); err == nil {
			conditions = append(conditions, "created_at <= ?")
			args = append(args, endTime)
		}
	}

	// Get chat logs with filtering
	logs, total, err := service.GetAllChatLogsAdmin(limit, offset, conditions, args)
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

// AdminExportChatLogs exports chat logs in JSONL format (admin only)
func AdminExportChatLogs(c *gin.Context) {
	// Parse query parameters for filtering
	userIDStr := c.Query("user_id")
	modelName := c.Query("model_name")
	requestType := c.Query("request_type")
	startTimeStr := c.Query("start_time")
	endTimeStr := c.Query("end_time")
	conversationID := c.Query("conversation_id")
	minDuplicateCountStr := c.Query("min_duplicate_count")
	maxRecordsStr := c.DefaultQuery("max_records", "10000") // Limit for safety

	maxRecords, err := strconv.Atoi(maxRecordsStr)
	if err != nil || maxRecords <= 0 || maxRecords > 100000 {
		maxRecords = 10000
	}

	// Build query conditions
	var conditions []string
	var args []interface{}

	if userIDStr != "" {
		if userID, err := strconv.Atoi(userIDStr); err == nil {
			conditions = append(conditions, "user_id = ?")
			args = append(args, userID)
		}
	}

	if modelName != "" {
		conditions = append(conditions, "model_name LIKE ?")
		args = append(args, "%"+modelName+"%")
	}

	if requestType != "" {
		conditions = append(conditions, "request_type = ?")
		args = append(args, requestType)
	}

	if conversationID != "" {
		conditions = append(conditions, "conversation_id = ?")
		args = append(args, conversationID)
	}

	if minDuplicateCountStr != "" {
		if minCount, err := strconv.Atoi(minDuplicateCountStr); err == nil && minCount > 0 {
			conditions = append(conditions, "duplicate_count >= ?")
			args = append(args, minCount)
		}
	}

	if startTimeStr != "" {
		if startTime, err := strconv.ParseInt(startTimeStr, 10, 64); err == nil {
			conditions = append(conditions, "created_at >= ?")
			args = append(args, startTime)
		}
	}

	if endTimeStr != "" {
		if endTime, err := strconv.ParseInt(endTimeStr, 10, 64); err == nil {
			conditions = append(conditions, "created_at <= ?")
			args = append(args, endTime)
		}
	}

	// Set response headers for file download
	timestamp := time.Now().Format("2006-01-02_15-04-05")
	filename := fmt.Sprintf("chat_logs_export_%s.jsonl", timestamp)
	c.Header("Content-Type", "application/x-ndjson")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))
	c.Header("Cache-Control", "no-cache")

	// Get logs in batches and stream them
	batchSize := 1000
	offset := 0
	exportedCount := 0

	c.Writer.WriteHeader(http.StatusOK)

	for exportedCount < maxRecords {
		currentBatchSize := batchSize
		if exportedCount+batchSize > maxRecords {
			currentBatchSize = maxRecords - exportedCount
		}

		logs, _, err := service.GetAllChatLogsAdmin(currentBatchSize, offset, conditions, args)
		if err != nil {
			// Write error to stream and stop
			errorLine := map[string]interface{}{
				"error":     "Failed to fetch logs",
				"message":   err.Error(),
				"timestamp": time.Now().Unix(),
			}
			jsonData, _ := json.Marshal(errorLine)
			c.Writer.Write(jsonData)
			c.Writer.Write([]byte("\n"))
			c.Writer.Flush()
			return
		}

		if len(logs) == 0 {
			break // No more data
		}

		// Write each log as a JSON line
		for _, log := range logs {
			if exportedCount >= maxRecords {
				break
			}

			jsonData, err := json.Marshal(log)
			if err != nil {
				continue // Skip invalid records
			}

			c.Writer.Write(jsonData)
			c.Writer.Write([]byte("\n"))
			exportedCount++
		}

		c.Writer.Flush() // Ensure data is sent to client
		offset += len(logs)

		if len(logs) < currentBatchSize {
			break // No more data
		}
	}
}

// AdminGetChatLogStats returns statistics about chat logs (admin only)
func AdminGetChatLogStats(c *gin.Context) {
	startTimeStr := c.Query("start_time")
	endTimeStr := c.Query("end_time")

	var startTime, endTime int64
	if startTimeStr != "" {
		if t, err := strconv.ParseInt(startTimeStr, 10, 64); err == nil {
			startTime = t
		}
	}
	if endTimeStr != "" {
		if t, err := strconv.ParseInt(endTimeStr, 10, 64); err == nil {
			endTime = t
		}
	}

	stats, err := service.GetChatLogStats(startTime, endTime)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    stats,
	})
}

// AdminDeleteChatLogs deletes chat logs with filtering (admin only)
func AdminDeleteChatLogs(c *gin.Context) {
	// Parse query parameters for filtering
	userIDStr := c.Query("user_id")
	modelName := c.Query("model_name")
	requestType := c.Query("request_type")
	startTimeStr := c.Query("start_time")
	endTimeStr := c.Query("end_time")
	conversationID := c.Query("conversation_id")

	// Require at least one filter to prevent accidental deletion of all logs
	if userIDStr == "" && modelName == "" && requestType == "" && startTimeStr == "" && endTimeStr == "" && conversationID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "At least one filter parameter is required for deletion",
		})
		return
	}

	// Build query conditions
	var conditions []string
	var args []interface{}

	if userIDStr != "" {
		if userID, err := strconv.Atoi(userIDStr); err == nil {
			conditions = append(conditions, "user_id = ?")
			args = append(args, userID)
		}
	}

	if modelName != "" {
		conditions = append(conditions, "model_name LIKE ?")
		args = append(args, "%"+modelName+"%")
	}

	if requestType != "" {
		conditions = append(conditions, "request_type = ?")
		args = append(args, requestType)
	}

	if conversationID != "" {
		conditions = append(conditions, "conversation_id = ?")
		args = append(args, conversationID)
	}

	if startTimeStr != "" {
		if startTime, err := strconv.ParseInt(startTimeStr, 10, 64); err == nil {
			conditions = append(conditions, "created_at >= ?")
			args = append(args, startTime)
		}
	}

	if endTimeStr != "" {
		if endTime, err := strconv.ParseInt(endTimeStr, 10, 64); err == nil {
			conditions = append(conditions, "created_at <= ?")
			args = append(args, endTime)
		}
	}

	deletedCount, err := service.DeleteChatLogsAdmin(conditions, args)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"deleted_count": deletedCount,
		},
	})
}
