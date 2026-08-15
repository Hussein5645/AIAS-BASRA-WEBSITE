package com.example.aiasbasrah

interface Platform {
    val name: String
}

expect fun getPlatform(): Platform