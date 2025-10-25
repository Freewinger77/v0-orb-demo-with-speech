"use client"

import { useState, useEffect, useRef } from "react"
import Script from "next/script"
import { Mic, PhoneOff, MessageSquare } from "lucide-react"
import { Orb, type AgentState } from "@/components/orb"

// Message type for conversation tracking
interface Message {
  role: "user" | "assistant"
  content: string
  timestamp: number
  isStreaming?: boolean
}

export default function VapiOrbDemo() {
  const [agentState, setAgentState] = useState<AgentState>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [status, setStatus] = useState("Inactive")
  const [vapiLoaded, setVapiLoaded] = useState(false)
  const [showConversation, setShowConversation] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [currentUserTranscript, setCurrentUserTranscript] = useState("")
  const [currentAssistantMessage, setCurrentAssistantMessage] = useState("")
  const [displayedAssistantMessage, setDisplayedAssistantMessage] = useState("")
  const [assistantVolume, setAssistantVolume] = useState(0)
  const [micRingState, setMicRingState] = useState<"idle" | "loading" | "shrinking" | "hidden">("idle")
  const [isAssistantTurn, setIsAssistantTurn] = useState(false)
  const vapiRef = useRef<any>(null)
  const assistantConfigRef = useRef<any>(null)
  const userMessagesEndRef = useRef<HTMLDivElement>(null)
  const assistantMessagesEndRef = useRef<HTMLDivElement>(null)
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const previousMessageLengthRef = useRef(0)

  const userMessages = messages.filter((m) => m.role === "user")
  const assistantMessages = messages.filter((m) => m.role === "assistant")

  useEffect(() => {
    if (currentAssistantMessage) {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current)
      }

      const previousLength = previousMessageLengthRef.current
      const newLength = currentAssistantMessage.length

      // If the message got shorter (replaced), reset
      if (newLength < previousLength) {
        previousMessageLengthRef.current = 0
        setDisplayedAssistantMessage("")
      }

      // Start typing from where we left off
      let currentIndex = previousLength

      typingIntervalRef.current = setInterval(() => {
        if (currentIndex < newLength) {
          setDisplayedAssistantMessage(currentAssistantMessage.slice(0, currentIndex + 1))
          currentIndex++
          previousMessageLengthRef.current = currentIndex
        } else {
          if (typingIntervalRef.current) {
            clearInterval(typingIntervalRef.current)
          }
        }
      }, 30)

      return () => {
        if (typingIntervalRef.current) {
          clearInterval(typingIntervalRef.current)
        }
      }
    } else {
      setDisplayedAssistantMessage("")
      previousMessageLengthRef.current = 0
    }
  }, [currentAssistantMessage])

  useEffect(() => {
    userMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    assistantMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, currentUserTranscript, displayedAssistantMessage])

  useEffect(() => {
    if (isConnected && micRingState === "loading") {
      setMicRingState("shrinking")
      setTimeout(() => setMicRingState("hidden"), 800)
    }
  }, [isConnected, micRingState])

  const initializeVapi = () => {
    if (typeof window !== "undefined" && (window as any).vapiSDK && !vapiRef.current) {
      const assistant = {
        name: "Voice Assistant",
        voice: {
          voiceId: "sarah",
          provider: "11labs",
        },
        model: {
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful voice assistant. Keep your responses concise and conversational. You can help users with questions and have natural conversations.",
            },
          ],
          provider: "openai",
        },
        firstMessage: "Hello! I'm your voice assistant. How can I help you today?",
        transcriber: {
          model: "nova-2",
          language: "en",
          provider: "deepgram",
        },
      }

      assistantConfigRef.current = assistant

      const apiKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY || "YOUR_VAPI_PUBLIC_KEY"

      try {
        vapiRef.current = (window as any).vapiSDK.run({
          apiKey: apiKey,
          assistant: assistant,
          config: {
            position: "bottom-right",
            offset: "40px",
            width: "0px",
            height: "0px",
            idle: {
              color: `rgba(0,0,0,0)`,
              type: "pill",
              title: "",
              subtitle: "",
            },
            loading: {
              color: `rgba(0,0,0,0)`,
              title: "",
              subtitle: "",
            },
            active: {
              color: `rgba(0,0,0,0)`,
              title: "",
              subtitle: "",
            },
          },
        })

        vapiRef.current.on("call-start", () => {
          setIsConnected(true)
          setStatus("Listening")
          setAgentState("listening")
          setMessages([])
          setCurrentUserTranscript("")
          setCurrentAssistantMessage("")
          setAssistantVolume(0)
        })

        vapiRef.current.on("call-end", () => {
          setIsConnected(false)
          setStatus("Inactive")
          setAgentState(null)
          setAssistantVolume(0)
          if (currentUserTranscript) {
            setMessages((prev) => [...prev, { role: "user", content: currentUserTranscript, timestamp: Date.now() }])
            setCurrentUserTranscript("")
          }
          if (currentAssistantMessage) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: currentAssistantMessage, timestamp: Date.now() },
            ])
            setCurrentAssistantMessage("")
          }
          setMicRingState("idle")
        })

        vapiRef.current.on("speech-start", () => {
          setAgentState("listening")
          setStatus("Listening")
          setIsAssistantTurn(false)
        })

        vapiRef.current.on("speech-end", () => {
          setAgentState("thinking")
          setStatus("Processing")
          if (currentUserTranscript) {
            setMessages((prev) => [...prev, { role: "user", content: currentUserTranscript, timestamp: Date.now() }])
            setCurrentUserTranscript("")
          }
        })

        vapiRef.current.on("volume-level", (volume: number) => {
          if (agentState === "talking") {
            setAssistantVolume(volume)
          }
        })

        vapiRef.current.on("message", (message: any) => {
          if (message.type === "transcript") {
            const role = message.role || "user"

            if (role === "user") {
              if (message.transcriptType === "partial") {
                setCurrentUserTranscript(message.transcript || "")
              } else if (message.transcriptType === "final") {
                setMessages((prev) => [
                  ...prev,
                  { role: "user", content: message.transcript || "", timestamp: Date.now() },
                ])
                setCurrentUserTranscript("")
              }
            } else if (role === "assistant") {
              setAgentState("talking")
              setStatus("Speaking")

              if (message.transcriptType === "partial") {
                setCurrentAssistantMessage(message.transcript || "")
                setIsAssistantTurn(true)
              } else if (message.transcriptType === "final") {
                setIsAssistantTurn(true)

                setMessages((prev) => {
                  const lastMessage = prev[prev.length - 1]
                  if (lastMessage && lastMessage.role === "assistant") {
                    return [
                      ...prev.slice(0, -1),
                      {
                        ...lastMessage,
                        content: lastMessage.content + " " + (message.transcript || ""),
                        timestamp: Date.now(),
                      },
                    ]
                  } else {
                    return [...prev, { role: "assistant", content: message.transcript || "", timestamp: Date.now() }]
                  }
                })
                setCurrentAssistantMessage("")
                setAgentState("listening")
                setAssistantVolume(0)
              }
            }
          }
        })

        vapiRef.current.on("error", (error: any) => {
          console.error("[v0] Vapi error:", error)
          setStatus("Error")
        })

        setVapiLoaded(true)
      } catch (error) {
        console.error("[v0] Failed to initialize Vapi:", error)
        setStatus("Failed")
      }
    }
  }

  const handleOrbClick = async () => {
    if (!vapiRef.current) return

    if (isConnected) {
      vapiRef.current.stop()
      setMicRingState("idle")
    } else {
      setMicRingState("loading")
      setAgentState("thinking")
      setStatus("Requesting permission...")

      try {
        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

        // Permission granted, stop the stream and proceed to connect
        stream.getTracks().forEach((track) => track.stop())

        setStatus("Connecting...")
        vapiRef.current.start(assistantConfigRef.current)
      } catch (error) {
        // Permission denied or error occurred
        console.error("[v0] Microphone permission denied:", error)
        setStatus("Permission denied")
        setAgentState(null)
        setMicRingState("idle")

        // Reset after showing error
        setTimeout(() => {
          setStatus("Inactive")
        }, 2000)
      }
    }
  }

  const handleEndCall = () => {
    if (vapiRef.current && isConnected) {
      vapiRef.current.stop()
    }
  }

  return (
    <>
      <style jsx global>{`
        vapi-widget,
        vapi-widget *,
        [class*="vapi"],
        [id*="vapi"],
        iframe[src*="vapi"],
        div[style*="position: fixed"][style*="bottom"],
        div[style*="position: fixed"][style*="right"] {
          display: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
          visibility: hidden !important;
          width: 0 !important;
          height: 0 !important;
          overflow: hidden !important;
          position: absolute !important;
          left: -9999px !important;
        }
      `}</style>

      <Script
        src="https://cdn.jsdelivr.net/gh/VapiAI/html-script-tag@latest/dist/assets/index.js"
        onLoad={() => {
          initializeVapi()
        }}
        onError={(e) => {
          console.error("[v0] Failed to load Vapi SDK:", e)
          setStatus("Failed")
        }}
      />

      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-transparent">
        <div className="w-full max-w-7xl flex items-center justify-center gap-8 relative">
          <div
            className={`flex-1 max-w-md transition-all duration-500 ease-out ${
              showConversation ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8 pointer-events-none"
            }`}
          >
            <div className="relative max-h-[30vh]">
              <div className="space-y-4 overflow-y-auto max-h-[30vh] pt-2 pb-4">
                {assistantMessages.slice(-4).map((message, index) => {
                  const totalVisible = Math.min(assistantMessages.length, 4)
                  const opacity = (index + 1) / totalVisible
                  return (
                    <div key={message.timestamp} className="transition-all duration-500 ease-out" style={{ opacity }}>
                      <div className="rounded-2xl px-4 py-3 bg-slate-700/30 backdrop-blur-xl border border-white/10 shadow-lg text-slate-100 rounded-bl-sm">
                        <p className="text-sm leading-relaxed">{message.content}</p>
                      </div>
                    </div>
                  )
                })}

                {displayedAssistantMessage && (
                  <div className="transition-all duration-500 ease-out">
                    <div className="rounded-2xl px-4 py-3 bg-slate-700/30 backdrop-blur-xl border border-white/10 shadow-lg text-slate-100 rounded-bl-sm">
                      <p className="text-sm leading-relaxed">{displayedAssistantMessage}</p>
                      <span className="inline-block w-1 h-4 bg-slate-300 ml-1 animate-pulse" />
                    </div>
                  </div>
                )}
                <div ref={assistantMessagesEndRef} />
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-6 z-10">
            <div className="flex flex-col items-center gap-6 relative">
              <div
                className="absolute inset-0 -z-10 transition-all duration-150"
                style={{
                  transform: `scale(${1 + assistantVolume * 0.5})`,
                  opacity: assistantVolume * 0.6,
                }}
              >
                <div className="absolute inset-0 bg-gradient-radial from-purple-500/40 via-blue-500/30 to-transparent blur-3xl animate-pulse" />
                <div className="absolute inset-0 bg-gradient-radial from-blue-500/40 via-purple-500/30 to-transparent blur-3xl animate-pulse delay-75" />
              </div>

              <button
                onClick={handleOrbClick}
                disabled={!vapiLoaded}
                className="h-72 w-72 flex items-center justify-center relative cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 transition-opacity focus:outline-none focus:ring-4 focus:ring-blue-500/50 rounded-full"
                aria-label={isConnected ? "End call" : "Start call"}
              >
                <Orb colors={["#8B5CF6", "#3B82F6"]} seed={42} agentState={agentState} className="h-full w-full" />

                {micRingState !== "hidden" && (
                  <div
                    className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ease-out ${
                      micRingState === "shrinking" ? "scale-0 opacity-0" : "scale-100 opacity-100"
                    }`}
                  >
                    <div className="relative w-full h-full">
                      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 288 288">
                        <defs>
                          <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.8" />
                            <stop offset="50%" stopColor="#8B5CF6" stopOpacity="0.6" />
                            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.8" />
                          </linearGradient>
                          <filter id="glow">
                            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                            <feMerge>
                              <feMergeNode in="coloredBlur" />
                              <feMergeNode in="SourceGraphic" />
                            </feMerge>
                          </filter>
                        </defs>

                        <circle
                          cx="144"
                          cy="144"
                          r="120"
                          fill="none"
                          stroke="rgba(255, 255, 255, 0.1)"
                          strokeWidth="24"
                          className="backdrop-blur-xl"
                        />

                        {micRingState === "loading" ? (
                          <>
                            <circle
                              cx="144"
                              cy="144"
                              r="120"
                              fill="none"
                              stroke="url(#ringGradient)"
                              strokeWidth="24"
                              strokeDasharray="753"
                              strokeDashoffset="188"
                              strokeLinecap="round"
                              filter="url(#glow)"
                              className="animate-spin origin-center"
                              style={{ animationDuration: "2s" }}
                            />
                          </>
                        ) : (
                          <>
                            <circle
                              cx="144"
                              cy="144"
                              r="120"
                              fill="none"
                              stroke="url(#ringGradient)"
                              strokeWidth="24"
                              strokeDasharray="188 565"
                              strokeLinecap="round"
                              filter="url(#glow)"
                            />
                            <circle
                              cx="144"
                              cy="144"
                              r="120"
                              fill="none"
                              stroke="url(#ringGradient)"
                              strokeWidth="24"
                              strokeDasharray="188 565"
                              strokeDashoffset="376"
                              strokeLinecap="round"
                              filter="url(#glow)"
                            />
                          </>
                        )}
                      </svg>

                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl flex items-center justify-center mb-3">
                          <Mic className="w-10 h-10 text-white/90" />
                        </div>
                        {micRingState === "idle" && (
                          <div className="px-4 py-2 bg-white/10 backdrop-blur-xl border border-white/20 shadow-lg rounded-full">
                            <p className="text-sm text-white font-light">start</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </button>

              <div className="px-6 py-2 bg-slate-700/30 backdrop-blur-xl border border-white/10 shadow-lg rounded-full">
                <p className="text-sm font-medium text-slate-100">{status}</p>
              </div>
            </div>

            <div className="flex items-center gap-4 px-8 py-5 bg-white/5 backdrop-blur-2xl rounded-full border border-white/20 shadow-2xl relative overflow-hidden">
              {/* Glass reflection effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none" />

              <button
                className="relative w-14 h-14 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 hover:scale-110 transition-all duration-300 flex items-center justify-center shadow-xl group"
                aria-label="Toggle microphone"
              >
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-slate-400/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <Mic className="w-6 h-6 text-white relative z-10" />
              </button>

              <button
                onClick={() => setShowConversation(!showConversation)}
                className={`relative w-14 h-14 rounded-full backdrop-blur-xl border border-white/20 hover:scale-110 transition-all duration-300 flex items-center justify-center shadow-xl group ${
                  showConversation ? "bg-blue-500/30 hover:bg-blue-500/40" : "bg-white/10 hover:bg-white/20"
                }`}
                aria-label="Toggle captions"
              >
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-400/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <MessageSquare className="w-6 h-6 text-white relative z-10" />
              </button>

              <button
                onClick={handleEndCall}
                disabled={!isConnected}
                className="relative w-14 h-14 rounded-full bg-red-500/20 backdrop-blur-xl border border-red-400/30 hover:bg-red-500/30 hover:scale-110 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all duration-300 flex items-center justify-center shadow-xl group"
                aria-label="End call"
              >
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-red-400/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <PhoneOff className="w-6 h-6 text-white relative z-10" />
              </button>
            </div>

            {!vapiLoaded && <p className="text-sm text-slate-500">Loading voice assistant...</p>}
          </div>

          <div
            className={`flex-1 max-w-md transition-all duration-500 ease-out ${
              showConversation ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8 pointer-events-none"
            }`}
          >
            <div className="relative max-h-[30vh]">
              <div className="space-y-4 overflow-y-auto max-h-[30vh] pt-2 pb-4">
                {userMessages.slice(-4).map((message, index) => {
                  const totalVisible = Math.min(userMessages.length, 4)
                  const opacity = (index + 1) / totalVisible
                  return (
                    <div
                      key={message.timestamp}
                      className="flex justify-end transition-all duration-500 ease-out"
                      style={{ opacity }}
                    >
                      <div className="rounded-2xl px-4 py-3 bg-blue-600/40 backdrop-blur-xl border border-white/20 shadow-lg text-white rounded-br-sm max-w-[85%]">
                        <p className="text-sm leading-relaxed">{message.content}</p>
                      </div>
                    </div>
                  )
                })}

                {currentUserTranscript && (
                  <div className="flex justify-end transition-all duration-500 ease-out">
                    <div className="rounded-2xl px-4 py-3 bg-blue-600/30 backdrop-blur-xl border border-white/20 shadow-lg text-white rounded-br-sm max-w-[85%]">
                      <p className="text-sm leading-relaxed">{currentUserTranscript}</p>
                      <span className="inline-block w-1 h-4 bg-white ml-1 animate-pulse" />
                    </div>
                  </div>
                )}
                <div ref={userMessagesEndRef} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
