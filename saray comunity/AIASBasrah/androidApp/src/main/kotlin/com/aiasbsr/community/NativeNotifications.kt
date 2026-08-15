package com.aiasbsr.community

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.edit
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import com.google.firebase.installations.FirebaseInstallations
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import java.security.MessageDigest

data class NativeNotificationTarget(
    val notificationId: String,
    val type: String,
    val postId: String,
    val detailId: String,
    val actorId: String,
    val url: String,
)

object CommunityPushRegistration {
    private const val PREFERENCES = "community_native_notifications"
    private const val ASKED_PERMISSION = "asked_permission"

    fun notificationsAllowed(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun permissionWasAsked(context: Context): Boolean =
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getBoolean(ASKED_PERMISSION, false)

    fun markPermissionAsked(context: Context) {
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit { putBoolean(ASKED_PERMISSION, true) }
    }

    fun sync(context: Context, done: (String?) -> Unit = {}) {
        if (!notificationsAllowed(context)) return done("Notification permission is required.")
        if (FirebaseAuth.getInstance().currentUser == null) return done(null)
        FirebaseMessaging.getInstance().register()
            .addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Notification registration failed.") }
    }

    fun saveRegisteredInstallation(installationId: String) {
        val userId = FirebaseAuth.getInstance().currentUser?.uid ?: return
        saveInstallation(userId, installationId) {}
    }

    fun removeBeforeSignOut(done: () -> Unit) {
        val userId = FirebaseAuth.getInstance().currentUser?.uid ?: return done()
        FirebaseInstallations.getInstance().id
            .addOnSuccessListener { installationId ->
                FirebaseFirestore.getInstance().collection("users").document(userId)
                    .collection("fcmTokens").document(targetId(installationId)).delete()
                    .addOnCompleteListener { done() }
            }
            .addOnFailureListener { done() }
    }

    private fun saveInstallation(userId: String, installationId: String, done: (String?) -> Unit) {
        if (installationId.isBlank()) return done("Firebase did not return an installation ID.")
        FirebaseFirestore.getInstance().collection("users").document(userId)
            .collection("fcmTokens").document(targetId(installationId)).set(
                mapOf(
                    "userId" to userId,
                    "fid" to installationId,
                    "userAgent" to "AIAS Basra Android ${Build.VERSION.RELEASE}",
                    "platform" to "android",
                    "createdAt" to FieldValue.serverTimestamp(),
                    "updatedAt" to FieldValue.serverTimestamp(),
                ),
                SetOptions.merge(),
            )
            .addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Notification registration failed.") }
    }

    private fun targetId(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
}

object CommunityNativeNotifications {
    const val CHANNEL_ID = "community_activity"
    const val EXTRA_NOTIFICATION_ID = "community.notification_id"
    const val EXTRA_TYPE = "community.notification_type"
    const val EXTRA_POST_ID = "community.post_id"
    const val EXTRA_DETAIL_ID = "community.detail_id"
    const val EXTRA_ACTOR_ID = "community.actor_id"
    const val EXTRA_URL = "community.url"
    private const val GROUP_KEY = "aias.community.activity"
    private const val DELIVERY_PREFERENCES = "community_notification_delivery"
    private const val SHOWN_IDS = "shown_notification_ids"

    fun createChannel(context: Context) {
        val channel = NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.community_notification_channel),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.community_notification_channel_description)
            enableVibration(true)
        }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    @SuppressLint("MissingPermission")
    fun show(context: Context, data: Map<String, String>, fallbackTitle: String?, fallbackBody: String?) {
        if (!CommunityPushRegistration.notificationsAllowed(context)) return
        val notificationId = data["notificationId"].orEmpty().ifBlank { System.currentTimeMillis().toString() }
        if (!markForDelivery(context, notificationId)) return
        createChannel(context)
        val title = data["title"].orEmpty().ifBlank { fallbackTitle ?: context.getString(R.string.app_name) }
        val body = data["body"].orEmpty().ifBlank { fallbackBody ?: "New community activity" }
        val tapIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(EXTRA_NOTIFICATION_ID, notificationId)
            putExtra(EXTRA_TYPE, data["type"].orEmpty())
            putExtra(EXTRA_POST_ID, data["postId"].orEmpty())
            putExtra(EXTRA_DETAIL_ID, data["detailId"].orEmpty())
            putExtra(EXTRA_ACTOR_ID, data["actorId"].orEmpty())
            putExtra(EXTRA_URL, data["url"].orEmpty())
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            notificationId.hashCode(),
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val publicVersion = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_community_notification)
            .setContentTitle(context.getString(R.string.app_name))
            .setContentText("New community activity")
            .build()
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_community_notification)
            .setColor(0xFF661F22.toInt())
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_SOCIAL)
            .setGroup(GROUP_KEY)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion)
            .build()
        NotificationManagerCompat.from(context).notify(notificationId.hashCode(), notification)
    }

    fun showCommunityItem(context: Context, item: CommunityNotification) {
        val action = when (item.type) {
            "moderation_flagged" -> "Your content was flagged"
            "moderation_cleared" -> "Your content was cleared by moderation"
            "moderation_warned" -> "Your content received a warning"
            "moderation_archived" -> "Your content was archived"
            "moderation_restored" -> "Your content was restored"
            "moderation_permanently_deleted" -> "Your content was permanently deleted"
            "space_post" -> "posted in your space"
            "mention" -> "mentioned you"
            "space_mention" -> "mentioned your space"
            "connection" -> "connected with you"
            "space_connection" -> "connected with your space"
            "space_request" -> "requested access to your space"
            "space_chat_request" -> "requested Messages access for your space"
            "main_thread_access_granted" -> "approved your main-thread posting access"
            "main_thread_access_denied" -> "reviewed your main-thread posting request"
            "space_post_warned" -> "warned your space post"
            "space_post_deleted" -> "deleted your space post"
            "space_member_warned" -> "sent you a space warning"
            "space_member_removed" -> "removed you from a space"
            "space_message" -> "sent a message in a space"
            "space_chat_removed" -> "removed you from a space chat"
            "reply" -> "replied to your comment"
            "applause" -> "applauded your post"
            else -> "commented on your post"
        }
        val moderated = item.type.startsWith("moderation_") || item.type in setOf("space_post_warned", "space_post_deleted", "space_member_warned", "space_member_removed", "space_chat_removed")
        val body = if (moderated) "$action. Reason: ${item.reason.ifBlank { "No reason provided." }}${if (item.eligibleToRepost) " You can repost an eligible copy to the main thread." else ""}" else "${item.actorName} $action${if (item.postTitle.isNotBlank()) " · ${item.postTitle}" else ""}"
        show(
            context,
            mapOf(
                "notificationId" to item.id,
                "title" to context.getString(R.string.app_name),
                "body" to body,
                "type" to item.type,
                "postId" to item.postId,
                "detailId" to item.detailId,
                "actorId" to item.actorId,
            ),
            null,
            null,
        )
    }

    @Synchronized
    private fun markForDelivery(context: Context, notificationId: String): Boolean {
        val preferences = context.getSharedPreferences(DELIVERY_PREFERENCES, Context.MODE_PRIVATE)
        val shown = preferences.getStringSet(SHOWN_IDS, emptySet()).orEmpty()
        if (notificationId in shown) return false
        val retained = if (shown.size < 100) shown else shown.take(50).toSet()
        preferences.edit { putStringSet(SHOWN_IDS, retained + notificationId) }
        return true
    }

    fun targetFrom(intent: Intent?): NativeNotificationTarget? {
        val notificationId = intent?.getStringExtra(EXTRA_NOTIFICATION_ID).orEmpty()
        if (notificationId.isBlank()) return null
        return NativeNotificationTarget(
            notificationId = notificationId,
            type = intent?.getStringExtra(EXTRA_TYPE).orEmpty(),
            postId = intent?.getStringExtra(EXTRA_POST_ID).orEmpty(),
            detailId = intent?.getStringExtra(EXTRA_DETAIL_ID).orEmpty(),
            actorId = intent?.getStringExtra(EXTRA_ACTOR_ID).orEmpty(),
            url = intent?.getStringExtra(EXTRA_URL).orEmpty(),
        )
    }
}

@SuppressLint("MissingFirebaseInstanceTokenRefresh") // FCM 25.1+ replaces tokens/onNewToken with FIDs/onRegistered.
class CommunityMessagingService : FirebaseMessagingService() {
    override fun onRegistered(installationId: String) {
        CommunityPushRegistration.saveRegisteredInstallation(installationId)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val signedInUser = FirebaseAuth.getInstance().currentUser ?: return
        val recipientId = message.data["recipientId"].orEmpty()
        if (recipientId.isNotBlank() && recipientId != signedInUser.uid) return
        CommunityNativeNotifications.show(
            applicationContext,
            message.data,
            message.notification?.title,
            message.notification?.body,
        )
    }
}
