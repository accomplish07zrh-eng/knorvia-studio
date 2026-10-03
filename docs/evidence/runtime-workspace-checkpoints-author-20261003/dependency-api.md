# API spellings supplement

All runtime fields are exactly this.eventStore/sessionStore/artifactStore/fileSystemPort,
this.sessionId/rootTraceContext. eventStore.getEvents(sessionId) -> Promise<SessionEvent[]>.
SessionEvent has type:SessionEventType,payload:unknown,timestamp:Date,sequenceNumber:number,
id:branded string,sessionId:branded string,traceId:branded string, optional turnId.
CheckpointCreatedPayload fields are checkpointId,snapshotRef,messageId,targetMessageId?,
compactBoundaryId?,coveredByCompact?,diffRef?,fileCount?,toolMessageId?,scope:RewindScope.
parseCheckpointCreatedPayload(event.payload) returns that payload; no envelope clone.
Runtime this.createEvent(SessionEventType.SessionForked,payload,traceContext) ->SessionEvent;
this.appendEvent(event,traceContext) ->Promise<void>.
this.persistAssistantTimelinePartForSession(options) ->Promise<void>, ONE object argument;
this.persistSyntheticUserNoticeForSession(options) ->Promise<void>, ONE object argument.
this.persistMessage(message,traceContext,copyFrom?) and this.persistPart(part,traceContext,copyFrom?).
SessionStore getSession(sessionId), messages({sessionID}); artifact readToolResultArtifact
({uri,trace},{signal}); no real ports in draft.
forkSourceMessagesForSession(parentMessages:MessageWithParts[],parentSession:SessionInfo)->MessageWithParts[];
resolveForkHistoryEndIndex(messages:MessageWithParts[],targetIndex:number,expandAssistantTurn:boolean)->number;
buildForkHistoryMessages(parentMessages:MessageWithParts[],forkSourceMessages:MessageWithParts[],
targetIndex:number,forkHistoryEndIndex:number)->MessageWithParts[]. Source argument is the
active transcript produced by forkSourceMessagesForSession; parentMessages is raw full
stored transcript needed only by existing compact-parent restoration. No body supplied.
