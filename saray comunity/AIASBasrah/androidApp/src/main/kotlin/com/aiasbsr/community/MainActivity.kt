package com.aiasbsr.community

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

class MainActivity : ComponentActivity() {
    private var notificationTarget by mutableStateOf<NativeNotificationTarget?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        CommunityNativeNotifications.createChannel(this)
        notificationTarget = CommunityNativeNotifications.targetFrom(intent)
        setContent {
            AIASCommunityApp(
                nativeNotificationTarget = notificationTarget,
                onNativeNotificationConsumed = { notificationTarget = null },
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        notificationTarget = CommunityNativeNotifications.targetFrom(intent)
    }
}
