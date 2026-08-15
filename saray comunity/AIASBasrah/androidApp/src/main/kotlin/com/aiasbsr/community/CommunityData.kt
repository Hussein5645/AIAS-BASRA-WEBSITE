package com.aiasbsr.community

import android.app.Application
import android.os.Handler
import android.os.Looper
import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import com.google.firebase.FirebaseApp
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.SetOptions
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.storage.FirebaseStorage
import com.google.firebase.storage.StorageMetadata
import java.util.Locale
import java.util.UUID
import kotlin.math.ln
import kotlin.math.max

enum class CommunityScreen { HOME, SPACES, SELECTED, CREATE, PROFILE, CONNECTIONS, SETTINGS, ARCHIVED, CHAT_INBOX, MESSAGES }
enum class FeedSort { RECOMMENDED, LATEST, POPULAR }
enum class PostFilter { ALL, THOUGHTS, QUESTIONS, PROJECTS }

data class Member(
    val uid: String,
    val username: String = "",
    val displayName: String = "Community member",
    val school: String = "",
    val city: String = "",
    val bio: String = "",
    val interests: String = "",
    val photoBase64: String = "",
    val photoUrl: String = "",
    val bannerBase64: String = "",
    val profileComplete: Boolean = false,
    val verified: Boolean = false,
    val mainThreadPostingAccess: Boolean = true,
    val mainThreadAccessStatus: String = "not_requested",
)

data class CommunitySpace(
    val slug: String,
    val name: String = "",
    val description: String = "",
    val symbol: String = "A",
    val active: Boolean = true,
    val archived: Boolean = false,
    val creatorId: String = "",
    val creatorUsername: String = "",
    val imageBase64: String = "",
    val bannerBase64: String = "",
    val isPrivate: Boolean = false,
    val isViewOnly: Boolean = false,
    val showInMainThread: Boolean = true,
    val chatEnabled: Boolean = false,
    val createdAt: Timestamp? = null,
)

data class SpaceMessage(
    val id: String,
    val senderId: String = "",
    val senderName: String = "Community member",
    val senderUsername: String = "",
    val text: String = "",
    val sharedPostId: String = "",
    val imagePath: String = "",
    val imageContentType: String = "",
    val audioPath: String = "",
    val audioContentType: String = "",
    val audioDurationMs: Long = 0,
    val replyToId: String = "",
    val replyToSenderId: String = "",
    val replyToSenderName: String = "",
    val replyToText: String = "",
    val editedAt: Timestamp? = null,
    val deleted: Boolean = false,
    val reactionCounts: Map<String, Int> = emptyMap(),
    val createdAt: Timestamp? = null,
)

data class SpaceMessageReaction(
    val userId: String,
    val emoji: String = "",
)

data class SpaceMessageRead(
    val userId: String,
    val lastMessageId: String = "",
    val seenAt: Timestamp? = null,
)

data class SpaceChatPresence(
    val userId: String,
    val activeAt: Timestamp? = null,
)

data class PendingSpaceMessage(
    val id: String,
    val text: String = "",
    val imageDataUrl: String = "",
    val voiceDurationMs: Long = 0,
    val status: String = "Sending…",
)

data class SpaceAccessRequest(
    val userId: String,
    val status: String = "pending",
    val requestedAt: Timestamp? = null,
)

data class SpaceMember(
    val userId: String,
    val createdAt: Timestamp? = null,
    val chatAccessApproved: Boolean = true,
)

data class SpaceBlock(
    val userId: String,
    val reason: String = "",
    val blockedAt: Timestamp? = null,
)

/** Server-issued, real-time permission record for the signed-in member. */
data class SpaceAccess(
    val member: Boolean = false,
    val manager: Boolean = false,
    val blocked: Boolean = false,
    val chatBanned: Boolean = false,
    val canReadPosts: Boolean = false,
    val canUseChat: Boolean = false,
)

data class SpaceManagement(
    val requests: List<SpaceAccessRequest> = emptyList(),
    val members: List<SpaceMember> = emptyList(),
    val adminIds: Set<String> = emptySet(),
    val chatAccessRequests: List<SpaceAccessRequest> = emptyList(),
    val chatBannedIds: Set<String> = emptySet(),
    val blockedUsers: List<SpaceBlock> = emptyList(),
)

data class PostMeta(
    val score: Int = 0,
    val mine: Int = 0,
    val commentsCount: Int = 0,
)

data class CommunityPost(
    val id: String,
    val type: String = "text",
    val title: String = "",
    val summary: String = "",
    val content: String = "",
    val behanceSrc: String = "",
    val communitySlug: String = "main",
    val userId: String = "",
    val authorName: String = "Community member",
    val authorUsername: String = "",
    val published: Boolean = true,
    val featured: Boolean = false,
    val archived: Boolean = false,
    val archiveCause: String = "",
    val archiveReason: String = "",
    val moderationStatus: String = "clear",
    val repostedPostId: String = "",
    val archivedAt: Timestamp? = null,
    val imageChunkCount: Int = 0,
    val imageMimeType: String = "",
    val imageChunkCounts: List<Int> = emptyList(),
    val imageMimeTypes: List<String> = emptyList(),
    val imagePaths: List<String> = emptyList(),
    val imageDataUrls: List<String> = emptyList(),
    val createdAt: Timestamp? = null,
    val editedAt: Timestamp? = null,
    val meta: PostMeta = PostMeta(),
)

data class CommunityComment(
    val id: String,
    val userId: String = "",
    val userName: String = "Community member",
    val text: String = "",
    val parentId: String? = null,
    val createdAt: Timestamp? = null,
    val editedAt: Timestamp? = null,
)

data class CommunityNotification(
    val id: String,
    val actorId: String = "",
    val actorName: String = "Community member",
    val actorUsername: String = "",
    val type: String = "comment",
    val postId: String = "",
    val postTitle: String = "Community post",
    val detailId: String = "",
    val reason: String = "",
    val eligibleToRepost: Boolean = false,
    val read: Boolean = false,
    val createdAt: Timestamp? = null,
)

private fun DocumentSnapshot.toMember() = Member(
    uid = id,
    username = getString("username").orEmpty(),
    displayName = getString("displayName").orEmpty().ifBlank { "Community member" },
    school = getString("school").orEmpty(),
    city = getString("city").orEmpty(),
    bio = getString("bio").orEmpty(),
    interests = getString("interests").orEmpty(),
    photoBase64 = getString("photoBase64").orEmpty(),
    photoUrl = getString("photoURL").orEmpty(),
    bannerBase64 = getString("bannerURL").orEmpty().ifBlank { getString("bannerBase64").orEmpty() },
    profileComplete = getBoolean("profileComplete") == true,
    verified = getBoolean("verified") == true,
    mainThreadPostingAccess = getBoolean("mainThreadPostingAccess") != false,
    mainThreadAccessStatus = getString("mainThreadAccessStatus").orEmpty().ifBlank { "not_requested" },
)

private fun DocumentSnapshot.toSpace() = CommunitySpace(
    slug = id,
    name = getString("name").orEmpty().ifBlank { id },
    description = getString("description").orEmpty(),
    symbol = getString("symbol").orEmpty().ifBlank { getString("name").orEmpty().take(1).uppercase() },
    active = getBoolean("active") != false,
    archived = getBoolean("archived") == true,
    creatorId = getString("creatorId").orEmpty(),
    creatorUsername = getString("creatorUsername").orEmpty(),
    imageBase64 = getString("imageURL").orEmpty().ifBlank { getString("imageBase64").orEmpty() },
    bannerBase64 = getString("bannerURL").orEmpty().ifBlank { getString("bannerBase64").orEmpty() },
    isPrivate = getBoolean("isPrivate") == true,
    isViewOnly = getBoolean("isViewOnly") == true,
    showInMainThread = getBoolean("showInMainThread") != false,
    chatEnabled = getBoolean("chatEnabled") == true,
    createdAt = getTimestamp("createdAt"),
)

private fun DocumentSnapshot.toSpaceMessage() = SpaceMessage(
    id = id,
    senderId = getString("senderId").orEmpty(),
    senderName = getString("senderName").orEmpty().ifBlank { "Community member" },
    senderUsername = getString("senderUsername").orEmpty(),
    text = getString("text").orEmpty(),
    sharedPostId = getString("sharedPostId").orEmpty(),
    imagePath = getString("imagePath").orEmpty(),
    imageContentType = getString("imageContentType").orEmpty(),
    audioPath = getString("audioPath").orEmpty(),
    audioContentType = getString("audioContentType").orEmpty(),
    audioDurationMs = getLong("audioDurationMs") ?: 0L,
    replyToId = getString("replyToId").orEmpty(),
    replyToSenderId = getString("replyToSenderId").orEmpty(),
    replyToSenderName = getString("replyToSenderName").orEmpty(),
    replyToText = getString("replyToText").orEmpty(),
    editedAt = getTimestamp("editedAt"),
    deleted = getBoolean("deleted") == true,
    reactionCounts = (get("reactionCounts") as? Map<*, *>)?.mapNotNull { (key, value) -> if (key is String && value is Number) key to value.toInt() else null }?.toMap().orEmpty(),
    createdAt = getTimestamp("createdAt"),
)

private fun DocumentSnapshot.toSpaceMessageRead() = SpaceMessageRead(
    userId = getString("userId").orEmpty().ifBlank { id },
    lastMessageId = getString("lastMessageId").orEmpty(),
    seenAt = getTimestamp("seenAt"),
)

private fun DocumentSnapshot.toSpaceChatPresence() = SpaceChatPresence(
    userId = getString("userId").orEmpty().ifBlank { id },
    activeAt = getTimestamp("activeAt"),
)

private fun DocumentSnapshot.toPost() = CommunityPost(
    id = id,
    type = getString("type").orEmpty().ifBlank { "text" },
    title = getString("title").orEmpty(),
    summary = getString("summary").orEmpty(),
    content = getString("content").orEmpty(),
    behanceSrc = getString("behanceSrc").orEmpty(),
    communitySlug = getString("communitySlug").orEmpty().ifBlank { "main" },
    userId = getString("userId").orEmpty(),
    authorName = getString("authorName").orEmpty().ifBlank { "Community member" },
    authorUsername = getString("authorUsername").orEmpty(),
    published = getBoolean("published") != false,
    featured = getBoolean("featured") == true,
    archived = getBoolean("archived") == true,
    archiveCause = getString("archiveCause").orEmpty(),
    archiveReason = getString("archiveReason").orEmpty(),
    moderationStatus = getString("moderationStatus").orEmpty().ifBlank { "clear" },
    repostedPostId = getString("repostedPostId").orEmpty(),
    archivedAt = getTimestamp("archivedAt"),
    imageChunkCount = (getLong("imageChunkCount") ?: 0L).toInt(),
    imageMimeType = getString("imageMimeType").orEmpty(),
    imageChunkCounts = (get("imageChunkCounts") as? List<*>)?.mapNotNull { (it as? Number)?.toInt() }.orEmpty(),
    imageMimeTypes = (get("imageMimeTypes") as? List<*>)?.mapNotNull { it as? String }.orEmpty(),
    imagePaths = (get("imagePaths") as? List<*>)?.mapNotNull { it as? String }.orEmpty(),
    createdAt = getTimestamp("createdAt"),
    editedAt = getTimestamp("editedAt") ?: getTimestamp("updatedAt"),
    meta = PostMeta(
        score = (getLong("score") ?: 0L).toInt(),
        commentsCount = (getLong("commentsCount") ?: 0L).toInt(),
    ),
)

private fun DocumentSnapshot.toComment() = CommunityComment(
    id = id,
    userId = getString("userId").orEmpty(),
    userName = getString("userName").orEmpty().ifBlank { "Community member" },
    text = getString("text").orEmpty(),
    parentId = getString("parentId"),
    createdAt = getTimestamp("createdAt"),
    editedAt = getTimestamp("editedAt"),
)

private fun DocumentSnapshot.toNotification() = CommunityNotification(
    id = id,
    actorId = getString("actorId").orEmpty(),
    actorName = getString("actorName").orEmpty().ifBlank { "Community member" },
    actorUsername = getString("actorUsername").orEmpty(),
    type = getString("type").orEmpty().ifBlank { "comment" },
    postId = getString("postId").orEmpty(),
    postTitle = getString("postTitle").orEmpty().ifBlank { "Community post" },
    detailId = getString("detailId").orEmpty(),
    reason = getString("reason").orEmpty(),
    eligibleToRepost = getBoolean("eligibleToRepost") == true,
    read = getBoolean("read") == true,
    createdAt = getTimestamp("createdAt"),
)

private fun DocumentSnapshot.toSpaceAccess() = SpaceAccess(
    member = getBoolean("member") == true,
    manager = getBoolean("manager") == true,
    blocked = getBoolean("blocked") == true,
    chatBanned = getBoolean("chatBanned") == true,
    canReadPosts = getBoolean("canReadPosts") == true,
    canUseChat = getBoolean("canUseChat") == true,
)

class FirebaseCommunityRepository private constructor(
    private val auth: FirebaseAuth,
    private val db: FirebaseFirestore,
    private val functions: FirebaseFunctions,
    private val storage: FirebaseStorage,
) {
    private val listeners = mutableListOf<ListenerRegistration>()
    private var notificationListener: ListenerRegistration? = null
    private var connectedSpacesListener: ListenerRegistration? = null
    private var connectedUsersListener: ListenerRegistration? = null
    private var selectedSpacePostsListener: ListenerRegistration? = null
    private var currentProfileListener: ListenerRegistration? = null
    private var spaceMessagesListener: ListenerRegistration? = null
    private var spaceMessageReadsListener: ListenerRegistration? = null
    private var spaceChatPresenceListener: ListenerRegistration? = null
    private var spaceAccessListener: ListenerRegistration? = null
    private var spaceChatRequestListener: ListenerRegistration? = null
    private var blockedSpacesListener: ListenerRegistration? = null
    private val userSpaceAccessListeners = mutableMapOf<String, ListenerRegistration>()
    private var userSpaceAccessGeneration = 0
    private var oldestSpaceMessageDocument: DocumentSnapshot? = null

    companion object {
        fun createOrNull(application: Application): FirebaseCommunityRepository? {
            if (FirebaseApp.getApps(application).isEmpty()) return null
            return FirebaseCommunityRepository(
                FirebaseAuth.getInstance(),
                FirebaseFirestore.getInstance(),
                FirebaseFunctions.getInstance("us-central1"),
                FirebaseStorage.getInstance(),
            )
        }
    }

    fun currentUser(): FirebaseUser? = auth.currentUser

    fun checkUsernameAvailability(rawUsername: String, done: (Boolean, String?) -> Unit) {
        val username = rawUsername.trim().lowercase(Locale.US).replace(Regex("[^a-z0-9_]"), "")
        if (!username.matches(Regex("^[a-z0-9_]{3,24}$"))) return done(false, null)
        db.collection("usernames").document(username).get()
            .addOnSuccessListener { snapshot ->
                done(!snapshot.exists() || snapshot.getString("userId") == auth.currentUser?.uid, null)
            }
            .addOnFailureListener { done(false, it.localizedMessage ?: "Username availability could not be checked.") }
    }

    fun checkSpaceHandleAvailability(rawSlug: String, done: (Boolean, String?) -> Unit) {
        val slug = normalizeSpaceHandle(rawSlug)
        if (slug == "main" || !slug.matches(Regex("^[a-z0-9-]{3,32}$"))) return done(false, null)
        db.collection("communitySpaces").document(slug).get()
            .addOnSuccessListener { done(!it.exists(), null) }
            .addOnFailureListener { done(false, it.localizedMessage ?: "Space availability could not be checked.") }
    }

    fun addAuthListener(listener: (FirebaseUser?) -> Unit): FirebaseAuth.AuthStateListener {
        val authListener = FirebaseAuth.AuthStateListener { listener(it.currentUser) }
        auth.addAuthStateListener(authListener)
        return authListener
    }

    fun removeAuthListener(listener: FirebaseAuth.AuthStateListener?) {
        listener?.let(auth::removeAuthStateListener)
    }

    fun listenNotifications(userId: String?, onItems: (List<CommunityNotification>) -> Unit, onError: (String) -> Unit) {
        notificationListener?.remove()
        notificationListener = null
        if (userId == null) return onItems(emptyList())
        notificationListener = db.collection("users").document(userId).collection("notifications")
            .orderBy("createdAt", Query.Direction.DESCENDING).limit(40)
            .addSnapshotListener { snapshot, error ->
                if (error != null) return@addSnapshotListener onError(error.localizedMessage ?: "Notifications are unavailable.")
                onItems(snapshot?.documents.orEmpty().map { it.toNotification() })
            }
    }

    fun listenCurrentProfile(userId: String?, onProfile: (Member?) -> Unit, onError: (String) -> Unit) {
        currentProfileListener?.remove()
        currentProfileListener = null
        if (userId == null) return onProfile(null)
        currentProfileListener = db.collection("users").document(userId).addSnapshotListener { snapshot, error ->
            if (error != null) return@addSnapshotListener onError(error.localizedMessage ?: "Your permissions are unavailable.")
            onProfile(snapshot?.takeIf { it.exists() }?.toMember())
        }
    }

    fun markNotificationRead(notificationId: String, done: (String?) -> Unit = {}) {
        val uid = auth.currentUser?.uid ?: return done("Sign in to manage notifications.")
        db.collection("users").document(uid).collection("notifications").document(notificationId)
            .set(mapOf("read" to true, "readAt" to FieldValue.serverTimestamp()), SetOptions.merge())
            .addOnSuccessListener { done(null) }.addOnFailureListener { done(it.localizedMessage ?: "Notification could not be updated.") }
    }

    fun markAllNotificationsRead(ids: List<String>, done: (String?) -> Unit) {
        val uid = auth.currentUser?.uid ?: return done("Sign in to manage notifications.")
        val batch = db.batch()
        ids.forEach { id -> batch.set(db.collection("users").document(uid).collection("notifications").document(id), mapOf("read" to true, "readAt" to FieldValue.serverTimestamp()), SetOptions.merge()) }
        batch.commit().addOnSuccessListener { done(null) }.addOnFailureListener { done(it.localizedMessage ?: "Notifications could not be updated.") }
    }

    fun start(
        onPosts: (List<CommunityPost>) -> Unit,
        onSpaces: (List<CommunitySpace>) -> Unit,
        onMembers: (Map<String, Member>) -> Unit,
        onPromptPostId: (String?) -> Unit,
        onError: (String) -> Unit,
    ) {
        stop()
        listeners += db.collection("communityPosts")
            .whereEqualTo("archived", false)
            .whereEqualTo("published", true)
            .whereEqualTo("moderationStatus", "clear")
            .whereEqualTo("visibility", "public")
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .limit(48)
            .addSnapshotListener { snapshot, error ->
                if (error != null) return@addSnapshotListener onError(error.localizedMessage ?: "Posts are unavailable.")
                val posts = snapshot?.documents.orEmpty().map { it.toPost() }.filter { it.published && !it.archived }
                hydratePostImages(posts, onPosts)
            }
        listeners += db.collection("communitySpaces").whereEqualTo("archived", false)
            .addSnapshotListener { snapshot, error ->
                if (error != null) return@addSnapshotListener onError(error.localizedMessage ?: "Spaces are unavailable.")
                onSpaces(snapshot?.documents.orEmpty().map { it.toSpace() }.filter { it.active && !it.archived })
            }
        listeners += db.collection("publicProfiles").limit(120)
            .addSnapshotListener { snapshot, error ->
                if (error != null) return@addSnapshotListener onError(error.localizedMessage ?: "Members are unavailable.")
                onMembers(snapshot?.documents.orEmpty().associate { it.id to it.toMember() })
            }
        listeners += db.collection("communitySettings").document("main")
            .addSnapshotListener { snapshot, error ->
                if (error != null) return@addSnapshotListener onError(error.localizedMessage ?: "Weekly question is unavailable.")
                onPromptPostId(snapshot?.getString("promptPostId")?.takeIf { it.isNotBlank() })
            }
    }

    fun stop() {
        notificationListener?.remove()
        notificationListener = null
        connectedSpacesListener?.remove()
        connectedSpacesListener = null
        connectedUsersListener?.remove()
        connectedUsersListener = null
        currentProfileListener?.remove()
        currentProfileListener = null
        selectedSpacePostsListener?.remove()
        selectedSpacePostsListener = null
        spaceMessagesListener?.remove()
        spaceMessagesListener = null
        spaceMessageReadsListener?.remove()
        spaceMessageReadsListener = null
        spaceChatPresenceListener?.remove()
        spaceChatPresenceListener = null
        spaceAccessListener?.remove()
        spaceAccessListener = null
        spaceChatRequestListener?.remove()
        spaceChatRequestListener = null
        blockedSpacesListener?.remove()
        blockedSpacesListener = null
        userSpaceAccessListeners.values.forEach(ListenerRegistration::remove)
        userSpaceAccessListeners.clear()
        userSpaceAccessGeneration += 1
        listeners.forEach(ListenerRegistration::remove)
        listeners.clear()
    }

    fun listenSelectedSpacePosts(spaceId: String?, onPosts: (List<CommunityPost>) -> Unit, onError: (String) -> Unit) {
        selectedSpacePostsListener?.remove()
        selectedSpacePostsListener = null
        if (spaceId.isNullOrBlank()) return onPosts(emptyList())
        selectedSpacePostsListener = db.collection("communityPosts")
            .whereEqualTo("archived", false)
            .whereEqualTo("published", true)
            .whereEqualTo("moderationStatus", "clear")
            .whereEqualTo("communitySlug", spaceId)
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .limit(36)
            .addSnapshotListener { snapshot, error ->
                if (error != null) return@addSnapshotListener onError(error.localizedMessage ?: "Space posts are unavailable.")
                hydratePostImages(snapshot?.documents.orEmpty().map(DocumentSnapshot::toPost), onPosts)
            }
    }

    private fun hydratePostImages(posts: List<CommunityPost>, done: (List<CommunityPost>) -> Unit) {
        if (posts.isEmpty()) return done(emptyList())
        val hydrated = posts.toMutableList()
        var remaining = posts.size
        fun complete(index: Int, post: CommunityPost) {
            hydrated[index] = post
            remaining -= 1
            if (remaining == 0) done(hydrated)
        }
        posts.forEachIndexed { index, post ->
            if (post.imagePaths.isNotEmpty()) {
                val urls = MutableList(post.imagePaths.size) { "" }
                var pathsRemaining = post.imagePaths.size
                post.imagePaths.forEachIndexed { pathIndex, path ->
                    storage.reference.child(path).downloadUrl
                        .addOnSuccessListener { uri ->
                            urls[pathIndex] = uri.toString()
                            pathsRemaining -= 1
                            if (pathsRemaining == 0) complete(index, post.copy(imageDataUrls = urls.filter(String::isNotBlank)))
                        }
                        .addOnFailureListener {
                            pathsRemaining -= 1
                            if (pathsRemaining == 0) complete(index, post.copy(imageDataUrls = urls.filter(String::isNotBlank)))
                        }
                }
                return@forEachIndexed
            }
            if (post.imageChunkCount < 1) return@forEachIndexed complete(index, post)
            db.collection("communityPosts").document(post.id).collection("images").get()
                .addOnSuccessListener { snapshot ->
                    val chunks = snapshot.documents.map { item ->
                        Triple(
                            (item.getLong("imageIndex") ?: 0L).toInt(),
                            (item.getLong("index") ?: 0L).toInt(),
                            item.getString("data").orEmpty(),
                        )
                    }
                    val urls = if (post.imageChunkCounts.isNotEmpty() && post.imageChunkCounts.size == post.imageMimeTypes.size) {
                        post.imageChunkCounts.mapIndexedNotNull { imageIndex, expected ->
                            val parts = chunks.filter { it.first == imageIndex }.sortedBy { it.second }
                            if (parts.size != expected || parts.any { it.third.isBlank() }) null
                            else "data:${post.imageMimeTypes[imageIndex]};base64," + parts.joinToString("") { it.third }
                        }
                    } else {
                        val parts = chunks.sortedBy { it.second }
                        if (parts.size == post.imageChunkCount && post.imageMimeType.isNotBlank()) {
                            listOf("data:${post.imageMimeType};base64," + parts.joinToString("") { it.third })
                        } else emptyList()
                    }
                    complete(index, post.copy(imageDataUrls = urls))
                }
                .addOnFailureListener { complete(index, post) }
        }
    }

    fun loadPostMeta(post: CommunityPost, userId: String?, result: (PostMeta) -> Unit) {
        if (userId == null) return result(post.meta.copy(mine = 0))
        db.collection("communityPosts").document(post.id).collection("votes").document(userId).get()
            .addOnSuccessListener { vote -> result(post.meta.copy(mine = (vote.getLong("value") ?: 0L).toInt())) }
            .addOnFailureListener { result(post.meta.copy(mine = 0)) }
    }

    fun signIn(email: String, password: String, done: (String?) -> Unit) {
        auth.signInWithEmailAndPassword(email.trim(), password)
            .addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Sign in failed.") }
    }

    fun signInWithGoogle(idToken: String, done: (String?) -> Unit) {
        val authenticate = {
            auth.signInWithCredential(GoogleAuthProvider.getCredential(idToken, null))
                .addOnSuccessListener { result ->
                    val user = result.user ?: return@addOnSuccessListener done("Google account could not be loaded.")
                    syncGoogleUser(user, done)
                }
                .addOnFailureListener { done(it.localizedMessage ?: "Google sign-in failed.") }
        }
        if (auth.currentUser == null) authenticate()
        else CommunityPushRegistration.removeBeforeSignOut {
            auth.signOut()
            authenticate()
        }
    }

    fun syncGoogleUser(user: FirebaseUser, done: (String?) -> Unit = {}) {
        val ref = db.collection("users").document(user.uid)
        ref.get().addOnSuccessListener { snapshot ->
            val values = mutableMapOf<String, Any?>(
                "lastLogin" to FieldValue.serverTimestamp(),
            )
            if (!snapshot.exists()) {
                values += mapOf(
                    "email" to user.email.orEmpty(),
                    "displayName" to user.displayName.orEmpty(),
                    "photoURL" to user.photoUrl?.toString().orEmpty(),
                    "profileComplete" to false,
                    "mainThreadPostingAccess" to false,
                    "mainThreadAccessStatus" to "not_requested",
                    "createdAt" to FieldValue.serverTimestamp(),
                )
            } else {
                if (snapshot.getString("displayName").isNullOrBlank() && !user.displayName.isNullOrBlank()) values["displayName"] = user.displayName
                if (snapshot.getString("photoURL").isNullOrBlank() && user.photoUrl != null) values["photoURL"] = user.photoUrl.toString()
            }
            ref.set(values, SetOptions.merge())
                .addOnSuccessListener { done(null) }
                .addOnFailureListener { done(it.localizedMessage ?: "Google profile could not be synchronized.") }
        }.addOnFailureListener { done(it.localizedMessage ?: "Community profile could not be checked.") }
    }

    fun completeGoogleProfile(
        rawUsername: String,
        displayName: String,
        school: String,
        city: String,
        bio: String,
        done: (String?) -> Unit,
    ) {
        val user = auth.currentUser ?: return done("Sign in with Google first.")
        val username = rawUsername.lowercase(Locale.US).replace(Regex("[^a-z0-9_]"), "")
        if (!username.matches(Regex("^[a-z0-9_]{3,24}$"))) return done("Username must be 3–24 lowercase letters, numbers, or underscores.")
        val usernameRef = db.collection("usernames").document(username)
        val userRef = db.collection("users").document(user.uid)
        db.runTransaction { transaction ->
            val claim = transaction.get(usernameRef)
            if (claim.exists() && claim.getString("userId") != user.uid) throw IllegalStateException("That username is already taken.")
            if (!claim.exists()) transaction.set(usernameRef, mapOf(
                "userId" to user.uid,
                "username" to username,
                "createdAt" to FieldValue.serverTimestamp(),
            ))
            transaction.set(userRef, mapOf(
                "email" to user.email.orEmpty(),
                "username" to username,
                "displayName" to displayName.trim(),
                "photoURL" to user.photoUrl?.toString().orEmpty(),
                "school" to school.trim(),
                "city" to city.trim(),
                "bio" to bio.trim(),
                "interests" to "",
                "photoBase64" to "",
                "bannerBase64" to "",
                "profileComplete" to true,
                "updatedAt" to FieldValue.serverTimestamp(),
            ), SetOptions.merge())
        }.addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Profile could not be completed.") }
    }

    fun register(
        email: String,
        password: String,
        displayName: String,
        rawUsername: String,
        done: (String?) -> Unit,
    ) {
        val username = rawUsername.lowercase(Locale.US).replace(Regex("[^a-z0-9_]"), "")
        if (!username.matches(Regex("^[a-z0-9_]{3,24}$"))) {
            done("Username must be 3–24 lowercase letters, numbers, or underscores.")
            return
        }
        auth.createUserWithEmailAndPassword(email.trim(), password)
            .addOnSuccessListener { authResult ->
                val uid = authResult.user?.uid ?: return@addOnSuccessListener done("Account could not be created.")
                val usernameRef = db.collection("usernames").document(username)
                usernameRef.get().addOnSuccessListener { existing ->
                    if (existing.exists()) return@addOnSuccessListener done("That username is already taken.")
                    val batch = db.batch()
                    batch.set(usernameRef, mapOf(
                        "userId" to uid,
                        "username" to username,
                        "createdAt" to FieldValue.serverTimestamp(),
                    ))
                    batch.set(db.collection("users").document(uid), mapOf(
                        "username" to username,
                        "displayName" to displayName.trim(),
                        "school" to "",
                        "city" to "Basra",
                        "interests" to "",
                        "bio" to "",
                        "photoBase64" to "",
                        "bannerBase64" to "",
                        "profileComplete" to true,
                        "mainThreadPostingAccess" to false,
                        "mainThreadAccessStatus" to "not_requested",
                        "createdAt" to FieldValue.serverTimestamp(),
                    ))
                    batch.commit().addOnSuccessListener { done(null) }
                        .addOnFailureListener { done(it.localizedMessage ?: "Profile could not be created.") }
                }.addOnFailureListener { done(it.localizedMessage ?: "Username could not be checked.") }
            }.addOnFailureListener { done(it.localizedMessage ?: "Account could not be created.") }
    }

    fun sendPasswordReset(email: String, done: (String?) -> Unit) {
        auth.sendPasswordResetEmail(email.trim())
            .addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Reset email could not be sent.") }
    }

    fun signOut() = CommunityPushRegistration.removeBeforeSignOut { auth.signOut() }

    fun createPost(
        type: String,
        title: String,
        content: String,
        behanceSrc: String,
        communitySlug: String,
        profile: Member,
        imageDataUrls: List<String>,
        done: (String?) -> Unit,
    ) {
        auth.currentUser?.uid ?: return done("Sign in before publishing.")
        val images = if (type == "text") imageDataUrls.take(6) else emptyList()
        val slug = if (type == "behance") "main" else communitySlug
        functions.getHttpsCallable("createCommunityPost").call(mapOf(
            "type" to type,
            "title" to title.trim(),
            "content" to content.trim(),
            "behanceSrc" to behanceSrc.trim(),
            "communitySlug" to slug,
            "mediaCount" to images.size,
        )).addOnSuccessListener { result ->
            val postId = (result.data as? Map<*, *>)?.get("postId") as? String
                ?: return@addOnSuccessListener done("The server did not return a post ID.")
            val post = CommunityPost(id = postId, type = type, title = title.trim(), content = content.trim(), communitySlug = slug, userId = auth.currentUser?.uid.orEmpty(), authorName = profile.displayName, authorUsername = profile.username)
            fun afterPublished() {
            sendMentionNotifications(post, title + "\n" + content, "")
            notifySpaceOwner(post)
            done(null)
            }
            if (images.isEmpty()) return@addOnSuccessListener afterPublished()
            fun upload(index: Int) {
                if (index >= images.size) {
                    functions.getHttpsCallable("finalizeCommunityPostMedia").call(mapOf("postId" to postId))
                        .addOnSuccessListener { afterPublished() }
                        .addOnFailureListener { done(it.localizedMessage ?: "Images were uploaded but the post could not be published.") }
                    return
                }
                val encoded = images[index].substringAfter("base64,", "")
                val bytes = runCatching { Base64.decode(encoded, Base64.DEFAULT) }.getOrNull()
                    ?: return done("Post image ${index + 1} could not be read.")
                val metadata = StorageMetadata.Builder().setContentType("image/jpeg").build()
                storage.reference.child("community/posts/$postId/${index.toString().padStart(2, '0')}.jpg")
                    .putBytes(bytes, metadata)
                    .addOnSuccessListener { upload(index + 1) }
                    .addOnFailureListener { done(it.localizedMessage ?: "Post images could not be uploaded.") }
            }
            upload(0)
        }.addOnFailureListener { done(it.localizedMessage ?: "Post could not be published.") }
    }

    fun updatePost(post: CommunityPost, title: String, content: String, behanceSrc: String, done: (String?) -> Unit) {
        val user = auth.currentUser ?: return done("Sign in to edit your post.")
        if (post.userId != user.uid) return done("Only the post author can edit this post.")
        db.collection("communityPosts").document(post.id).set(
            mapOf(
                "title" to title.trim(),
                "summary" to content.trim().take(360),
                "content" to content.trim(),
                "behanceSrc" to if (post.type == "behance") behanceSrc.trim() else "",
                "editedAt" to FieldValue.serverTimestamp(),
            ),
            SetOptions.merge(),
        ).addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Post could not be updated.") }
    }

    fun deletePost(post: CommunityPost, done: (String?) -> Unit) {
        val user = auth.currentUser ?: return done("Sign in to delete your post.")
        if (post.userId != user.uid) return done("Only the post author can delete this post.")
        functions.getHttpsCallable("deleteOwnCommunityPost").call(mapOf("postId" to post.id))
            .addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Post could not be deleted.") }
    }

    fun loadEligibleArchivedPosts(done: (List<CommunityPost>, String?) -> Unit) {
        val user = auth.currentUser ?: return done(emptyList(), "Sign in to view archived posts.")
        db.collection("communityPosts")
            .whereEqualTo("userId", user.uid)
            .whereEqualTo("archived", true)
            .whereEqualTo("archiveCause", "space_cascade")
            .whereEqualTo("moderationStatus", "clear")
            .orderBy("archivedAt", Query.Direction.DESCENDING)
            .get()
            .addOnSuccessListener { snapshot ->
                hydratePostImages(snapshot.documents.map(DocumentSnapshot::toPost)) { done(it, null) }
            }
            .addOnFailureListener { done(emptyList(), it.localizedMessage ?: "Archived posts are unavailable.") }
    }

    fun repostArchivedPost(post: CommunityPost, done: (String?, String?) -> Unit) {
        val user = auth.currentUser ?: return done(null, "Sign in to repost your content.")
        if (post.userId != user.uid || !post.archived || post.archiveCause != "space_cascade" || post.moderationStatus == "flagged") {
            return done(null, "This archived post is not eligible for reposting.")
        }
        if (post.repostedPostId.isNotBlank()) return done(post.repostedPostId, "This post was already reposted.")
        functions.getHttpsCallable("repostUnavailableSpacePost").call(mapOf("postId" to post.id))
            .addOnSuccessListener { result ->
                val postId = (result.data as? Map<*, *>)?.get("postId") as? String
                done(postId, if (postId == null) "The server did not return a post ID." else null)
            }
            .addOnFailureListener { done(null, it.localizedMessage ?: "Post could not be reposted.") }
    }

    fun vote(post: CommunityPost, value: Int, done: (String?) -> Unit) {
        if (auth.currentUser == null) return done("Sign in to react.")
        functions.getHttpsCallable("setCommunityPostVote").call(mapOf("postId" to post.id, "value" to value))
            .addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Reaction could not be saved.") }
    }

    fun loadComments(postId: String, done: (List<CommunityComment>, String?) -> Unit) {
        db.collection("communityPosts").document(postId).collection("comments")
            .orderBy("createdAt", Query.Direction.ASCENDING).limit(100).get()
            .addOnSuccessListener { done(it.documents.map(DocumentSnapshot::toComment), null) }
            .addOnFailureListener { done(emptyList(), it.localizedMessage ?: "Comments are unavailable.") }
    }

    fun addComment(post: CommunityPost, text: String, parentId: String?, replyToUserId: String?, displayName: String, done: (String?) -> Unit) {
        val user = auth.currentUser ?: return done("Sign in to join the discussion.")
        functions.getHttpsCallable("createCommunityComment").call(mapOf("postId" to post.id, "text" to text.trim(), "parentId" to parentId))
            .addOnSuccessListener { result ->
                val commentId = (result.data as? Map<*, *>)?.get("commentId") as? String ?: ""
                sendMentionNotifications(post, text, commentId)
                done(null)
            }.addOnFailureListener { done(it.localizedMessage ?: "Comment could not be posted.") }
    }

    fun updateComment(postId: String, commentId: String, text: String, done: (String?) -> Unit) {
        if (auth.currentUser == null) return done("Sign in to edit comments.")
        functions.getHttpsCallable("updateCommunityComment").call(mapOf("postId" to postId, "commentId" to commentId, "text" to text.trim()))
            .addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Comment could not be updated.") }
    }

    fun deleteComment(postId: String, commentId: String, done: (String?) -> Unit) {
        if (auth.currentUser == null) return done("Sign in to delete comments.")
        functions.getHttpsCallable("deleteCommunityComment").call(mapOf("postId" to postId, "commentId" to commentId))
            .addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Comment could not be deleted.") }
    }

    private fun sendNotification(post: CommunityPost, type: String, detailId: String, explicitRecipient: String = post.userId) {
        val user = auth.currentUser ?: return
        if (explicitRecipient == user.uid || explicitRecipient.isBlank()) return
        val profileRef = db.collection("users").document(user.uid)
        profileRef.get().addOnSuccessListener { profile ->
            val notificationId = listOf(type, post.id, user.uid, detailId).filter { it.isNotBlank() }.joinToString("_")
            db.collection("users").document(explicitRecipient).collection("notifications").document(notificationId)
                .set(mapOf(
                    "recipientId" to explicitRecipient,
                    "actorId" to user.uid,
                    "actorName" to (profile.getString("displayName") ?: "Community member"),
                    "actorUsername" to (profile.getString("username") ?: ""),
                    "type" to type,
                    "postId" to post.id,
                    "postTitle" to post.title,
                    "detailId" to detailId,
                    "read" to false,
                    "createdAt" to FieldValue.serverTimestamp(),
                ))
        }
    }

    private fun sendMentionNotifications(post: CommunityPost, text: String, sourceId: String) {
        val actor = auth.currentUser ?: return
        val matches = Regex("(^|[^A-Za-z0-9_.+\\-])@(?:(?:a/)([a-z0-9-]{3,32})|([a-z0-9_]{3,24}))", setOf(RegexOption.IGNORE_CASE, RegexOption.MULTILINE)).findAll(text).toList()
        val usernames = matches.mapNotNull { it.groupValues[3].takeIf(String::isNotBlank)?.lowercase(Locale.US) }.distinct().take(20)
        val spaces = matches.mapNotNull { it.groupValues[2].takeIf(String::isNotBlank)?.lowercase(Locale.US) }.distinct().take(20)
        fun create(recipientId: String, type: String, detailId: String) {
            if (recipientId.isBlank() || recipientId == actor.uid) return
            db.collection("users").document(actor.uid).get().addOnSuccessListener { profile ->
                val key = listOf(type, post.id, actor.uid, sourceId.ifBlank { post.id }, detailId).joinToString("_")
                db.collection("users").document(recipientId).collection("notifications").document(key).set(mapOf(
                    "recipientId" to recipientId,
                    "actorId" to actor.uid,
                    "actorName" to (profile.getString("displayName") ?: "Community member"),
                    "actorUsername" to (profile.getString("username") ?: ""),
                    "type" to type,
                    "postId" to post.id,
                    "postTitle" to post.title.take(160),
                    "detailId" to detailId,
                    "sourceId" to sourceId,
                    "read" to false,
                    "createdAt" to FieldValue.serverTimestamp(),
                ))
            }
        }
        usernames.forEach { username ->
            db.collection("usernames").document(username).get().addOnSuccessListener { claim -> create(claim.getString("userId").orEmpty(), "mention", sourceId) }
        }
        spaces.forEach { slug ->
            db.collection("communitySpaces").document(slug).get().addOnSuccessListener { space -> create(space.getString("creatorId").orEmpty(), "space_mention", slug) }
        }
    }

    private fun notifySpaceOwner(post: CommunityPost) {
        val actor = auth.currentUser ?: return
        if (post.communitySlug == "main") return
        db.collection("communitySpaces").document(post.communitySlug).get().addOnSuccessListener { space ->
            val owner = space.getString("creatorId").orEmpty()
            if (owner.isBlank() || owner == actor.uid) return@addOnSuccessListener
            db.collection("users").document(actor.uid).get().addOnSuccessListener { profile ->
                db.collection("users").document(owner).collection("notifications").document("space_post_${post.id}_${actor.uid}").set(mapOf(
                    "recipientId" to owner, "actorId" to actor.uid,
                    "actorName" to (profile.getString("displayName") ?: "Community member"),
                    "actorUsername" to (profile.getString("username") ?: ""),
                    "type" to "space_post", "postId" to post.id, "postTitle" to post.title.take(160),
                    "detailId" to post.communitySlug, "read" to false, "createdAt" to FieldValue.serverTimestamp(),
                ))
            }
        }
    }

    fun createSpace(name: String, rawSlug: String, description: String, profile: Member, imageBase64: String, bannerBase64: String, isPrivate: Boolean, isViewOnly: Boolean, showInMainThread: Boolean, done: (String?) -> Unit) {
        auth.currentUser ?: return done("Sign in before creating a space.")
        val slug = normalizeSpaceHandle(rawSlug)
        if (slug == "main" || !slug.matches(Regex("^[a-z0-9-]{3,32}$"))) return done("Choose a valid, non-reserved handle.")
        val ref = db.collection("communitySpaces").document(slug)
        functions.getHttpsCallable("setCommunitySpaceConnection").call(mapOf(
            "operation" to "create_space",
            "spaceId" to slug,
                "name" to name.trim(),
                "description" to description.trim(),
                "isPrivate" to isPrivate,
                "isViewOnly" to (!isPrivate && isViewOnly),
                "showInMainThread" to (!isPrivate && showInMainThread),
        )).addOnSuccessListener {
            storeImage("community/spaces/$slug/avatar", imageBase64) { imageUrl, imageError ->
                if (imageError != null) return@storeImage done(imageError)
                storeImage("community/spaces/$slug/banner", bannerBase64) { bannerUrl, bannerError ->
                    if (bannerError != null) return@storeImage done(bannerError)
                    ref.set(mapOf("imageURL" to imageUrl, "bannerURL" to bannerUrl), SetOptions.merge())
                        .addOnSuccessListener { done(null) }
                        .addOnFailureListener { done(it.localizedMessage ?: "Space media could not be saved.") }
                }
            }
        }.addOnFailureListener { done(it.localizedMessage ?: "Space could not be created.") }
    }

    fun updateSpace(space: CommunitySpace, name: String, description: String, imageBase64: String, bannerBase64: String, isPrivate: Boolean, isViewOnly: Boolean, showInMainThread: Boolean, done: (String?) -> Unit) {
        val user = auth.currentUser ?: return done("Sign in before editing a space.")
        if (space.creatorId != user.uid) return done("Only the space owner can edit this space.")
        storeImage("community/spaces/${space.slug}/avatar", imageBase64) { imageUrl, imageError ->
            if (imageError != null) return@storeImage done(imageError)
            storeImage("community/spaces/${space.slug}/banner", bannerBase64) { bannerUrl, bannerError ->
                if (bannerError != null) return@storeImage done(bannerError)
        functions.getHttpsCallable("setCommunitySpaceConnection").call(mapOf(
            "operation" to "set_space_visibility",
            "spaceId" to space.slug,
            "isPrivate" to isPrivate,
            "isViewOnly" to (!isPrivate && isViewOnly),
            "showInMainThread" to (!isPrivate && showInMainThread),
        )).addOnSuccessListener {
        db.collection("communitySpaces").document(space.slug).set(mapOf(
            "name" to name.trim(),
            "description" to description.trim(),
            "symbol" to initials(name),
            "imageBase64" to "",
            "bannerBase64" to "",
            "imageURL" to imageUrl,
            "bannerURL" to bannerUrl,
            "updatedAt" to FieldValue.serverTimestamp(),
        ), SetOptions.merge()).addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Space could not be updated.") }
        }.addOnFailureListener { done(it.localizedMessage ?: "This space cannot be public while restricted members are connected.") }
            }
        }
    }

    fun updateSpaceVisibility(space: CommunitySpace, isPrivate: Boolean, isViewOnly: Boolean, showInMainThread: Boolean, done: (String?) -> Unit) {
        auth.currentUser ?: return done("Sign in before editing a space.")
        functions.getHttpsCallable("setCommunitySpaceConnection").call(mapOf(
            "operation" to "set_space_visibility",
            "spaceId" to space.slug,
            "isPrivate" to isPrivate,
            "isViewOnly" to (!isPrivate && isViewOnly),
            "showInMainThread" to (!isPrivate && showInMainThread),
        )).addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Space visibility could not be updated.") }
    }

    fun requestMainThreadPostingAccess(done: (String?) -> Unit) {
        auth.currentUser ?: return done("Sign in before requesting access.")
        functions.getHttpsCallable("setCommunitySpaceConnection").call(mapOf("operation" to "request_main_thread_access"))
            .addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "The access request could not be sent.") }
    }

    fun deleteSpace(space: CommunitySpace, done: (String?) -> Unit) {
        val user = auth.currentUser ?: return done("Sign in before deleting a space.")
        if (space.creatorId != user.uid) return done("Only the space owner can delete this space.")
        db.collection("communitySpaces").document(space.slug).delete()
            .addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Space could not be deleted.") }
    }

    fun connectSpace(space: CommunitySpace, connected: Boolean, done: (String?) -> Unit) {
        val user = auth.currentUser ?: return done("Sign in to connect with spaces.")
        functions.getHttpsCallable("setCommunitySpaceConnection").call(mapOf("spaceId" to space.slug, "connected" to connected))
            .addOnSuccessListener {
                val notificationType = if (connected && (space.isPrivate || space.isViewOnly) && space.creatorId != user.uid) "space_request" else "space_connection"
                updateConnectionNotification(space.creatorId, notificationType, space.slug, space.name, connected)
                done(null)
            }
            .addOnFailureListener { done(it.localizedMessage ?: "Connection could not be updated.") }
    }

    fun loadSpaceRequestStatuses(spaces: List<CommunitySpace>, done: (Map<String, String>) -> Unit) {
        val uid = auth.currentUser?.uid ?: return done(emptyMap())
        val privateSpaces = spaces.filter { (it.isPrivate || it.isViewOnly) && it.creatorId != uid }
        if (privateSpaces.isEmpty()) return done(emptyMap())
        val statuses = mutableMapOf<String, String>()
        var remaining = privateSpaces.size
        privateSpaces.forEach { space ->
            db.collection("communitySpaces").document(space.slug).collection("connectionRequests").document(uid).get()
                .addOnCompleteListener { task ->
                    if (task.isSuccessful) task.result?.getString("status")?.let { statuses[space.slug] = it }
                    remaining -= 1
                    if (remaining == 0) done(statuses)
                }
        }
    }

    fun loadSpaceManagement(space: CommunitySpace, done: (SpaceManagement, String?) -> Unit) {
        auth.currentUser ?: return done(SpaceManagement(), "Sign in to manage spaces.")
        var requests: List<SpaceAccessRequest>? = null
        var members: List<SpaceMember>? = null
        var adminIds: Set<String>? = null
        var chatAccessRequests: List<SpaceAccessRequest>? = null
        var chatBannedIds: Set<String>? = null
        var blockedUsers: List<SpaceBlock>? = null
        var failure: String? = null
        fun finish() {
            if (requests != null && members != null && adminIds != null && chatAccessRequests != null && chatBannedIds != null && blockedUsers != null) done(SpaceManagement(requests.orEmpty(), members.orEmpty(), adminIds.orEmpty(), chatAccessRequests.orEmpty(), chatBannedIds.orEmpty(), blockedUsers.orEmpty()), failure)
        }
        db.collection("communitySpaces").document(space.slug).collection("connectionRequests")
            .whereEqualTo("status", "pending").get()
            .addOnSuccessListener { snapshot ->
                requests = snapshot.documents.map { SpaceAccessRequest(it.id, it.getString("status").orEmpty(), it.getTimestamp("requestedAt")) }
                finish()
            }.addOnFailureListener { failure = it.localizedMessage; requests = emptyList(); finish() }
        db.collection("communitySpaces").document(space.slug).collection("connections").get()
            .addOnSuccessListener { snapshot ->
                members = snapshot.documents.map { SpaceMember(it.id, it.getTimestamp("createdAt"), it.getBoolean("chatAccessApproved") != false) }
                finish()
            }.addOnFailureListener { failure = it.localizedMessage; members = emptyList(); finish() }
        db.collection("communitySpaces").document(space.slug).collection("admins").get()
            .addOnSuccessListener { snapshot -> adminIds = snapshot.documents.map { it.id }.toSet(); finish() }
            .addOnFailureListener { failure = it.localizedMessage; adminIds = emptySet(); finish() }
        db.collection("communitySpaces").document(space.slug).collection("chatAccessRequests").whereEqualTo("status", "pending").get()
            .addOnSuccessListener { snapshot -> chatAccessRequests = snapshot.documents.map { SpaceAccessRequest(it.id, it.getString("status").orEmpty(), it.getTimestamp("requestedAt")) }; finish() }
            .addOnFailureListener { failure = it.localizedMessage; chatAccessRequests = emptyList(); finish() }
        db.collection("communitySpaces").document(space.slug).collection("chatBans").get()
            .addOnSuccessListener { snapshot -> chatBannedIds = snapshot.documents.map { it.id }.toSet(); finish() }
            .addOnFailureListener { failure = it.localizedMessage; chatBannedIds = emptySet(); finish() }
        db.collection("communitySpaces").document(space.slug).collection("blocks").get()
            .addOnSuccessListener { snapshot -> blockedUsers = snapshot.documents.map { SpaceBlock(it.getString("userId") ?: it.id, it.getString("reason").orEmpty(), it.getTimestamp("blockedAt")) }; finish() }
            .addOnFailureListener { failure = it.localizedMessage; blockedUsers = emptyList(); finish() }
    }

    fun loadManagedSpaceIds(spaces: List<CommunitySpace>, done: (Set<String>) -> Unit) {
        val uid = auth.currentUser?.uid ?: return done(emptySet())
        if (spaces.isEmpty()) return done(emptySet())
        val managed = spaces.filter { it.creatorId == uid }.mapTo(mutableSetOf()) { it.slug }
        var remaining = spaces.size
        spaces.forEach { space ->
            db.collection("communitySpaces").document(space.slug).collection("admins").document(uid).get()
                .addOnCompleteListener { task ->
                    if (task.isSuccessful && task.result?.exists() == true) managed += space.slug
                    remaining -= 1
                    if (remaining == 0) done(managed)
                }
        }
    }

    fun listenBlockedSpaceIds(userId: String?, onItems: (Set<String>) -> Unit, onError: (String) -> Unit) {
        blockedSpacesListener?.remove()
        blockedSpacesListener = null
        if (userId.isNullOrBlank()) return onItems(emptySet())
        blockedSpacesListener = db.collection("users").document(userId).collection("blockedSpaces")
            .addSnapshotListener { snapshot, error ->
                if (error != null) return@addSnapshotListener onError(error.localizedMessage ?: "Blocked spaces are unavailable.")
                onItems(snapshot?.documents.orEmpty().mapTo(mutableSetOf()) { it.id })
            }
    }

    /** Keeps the server-issued access records in sync for every visible space. */
    fun listenSpaceAccessRecords(
        userId: String?,
        spaceIds: Collection<String>,
        onItems: (Map<String, SpaceAccess>) -> Unit,
        onError: (String) -> Unit,
    ) {
        userSpaceAccessListeners.values.forEach(ListenerRegistration::remove)
        userSpaceAccessListeners.clear()
        userSpaceAccessGeneration += 1
        val generation = userSpaceAccessGeneration
        if (userId.isNullOrBlank() || spaceIds.isEmpty()) return onItems(emptyMap())
        val accessBySpace = mutableMapOf<String, SpaceAccess>()
        onItems(emptyMap())
        spaceIds.distinct().forEach { spaceId ->
            userSpaceAccessListeners[spaceId] = db.collection("communitySpaces").document(spaceId)
                .collection("access").document(userId)
                .addSnapshotListener { snapshot, error ->
                    if (generation != userSpaceAccessGeneration) return@addSnapshotListener
                    if (error != null) return@addSnapshotListener onError(error.localizedMessage ?: "Space access is unavailable.")
                    if (snapshot?.exists() == true) accessBySpace[spaceId] = snapshot.toSpaceAccess()
                    else accessBySpace.remove(spaceId)
                    onItems(accessBySpace.toMap())
                }
        }
    }

    fun loadLatestChatMessages(spaces: List<CommunitySpace>, done: (Map<String, SpaceMessage>) -> Unit) {
        if (spaces.isEmpty()) return done(emptyMap())
        val latest = mutableMapOf<String, SpaceMessage>()
        var remaining = spaces.size
        spaces.forEach { space ->
            db.collection("communitySpaces").document(space.slug).collection("messages")
                .orderBy("createdAt", Query.Direction.DESCENDING).limit(1).get()
                .addOnCompleteListener { task ->
                    if (task.isSuccessful) task.result?.documents?.firstOrNull()?.let { latest[space.slug] = it.toSpaceMessage() }
                    remaining -= 1
                    if (remaining == 0) done(latest)
                }
        }
    }

    fun setSpaceAdmin(space: CommunitySpace, userId: String, enabled: Boolean, done: (String?) -> Unit) {
        functions.getHttpsCallable("setCommunitySpaceAdmin").call(mapOf("spaceId" to space.slug, "userId" to userId, "enabled" to enabled))
            .addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Space administrator could not be updated.") }
    }

    fun moderateSpacePost(post: CommunityPost, action: String, reason: String, done: (String?) -> Unit) {
        functions.getHttpsCallable("setCommunitySpaceConnection").call(mapOf("operation" to "moderate_space_post", "postId" to post.id, "action" to action, "reason" to reason))
            .addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Space post could not be moderated.") }
    }

    fun warnSpaceMember(space: CommunitySpace, userId: String, reason: String, done: (String?) -> Unit) {
        functions.getHttpsCallable("setCommunitySpaceConnection").call(mapOf("operation" to "warn_space_member", "spaceId" to space.slug, "userId" to userId, "reason" to reason))
            .addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Member warning could not be sent.") }
    }

    fun listenSpaceMessages(spaceId: String, onItems: (List<SpaceMessage>) -> Unit, onError: (String) -> Unit) {
        spaceMessagesListener?.remove()
        oldestSpaceMessageDocument = null
        spaceMessagesListener = db.collection("communitySpaces").document(spaceId).collection("messages")
            .orderBy("createdAt", Query.Direction.DESCENDING).limit(30)
            .addSnapshotListener { snapshot, error ->
                if (error != null) return@addSnapshotListener onError(error.localizedMessage ?: "Space messages are unavailable.")
                val documents = snapshot?.documents.orEmpty()
                oldestSpaceMessageDocument = documents.lastOrNull()
                onItems(documents.map { it.toSpaceMessage() }.reversed())
            }
    }

    fun loadOlderSpaceMessages(spaceId: String, done: (List<SpaceMessage>, Boolean, String?) -> Unit) {
        val cursor = oldestSpaceMessageDocument ?: return done(emptyList(), false, null)
        db.collection("communitySpaces").document(spaceId).collection("messages")
            .orderBy("createdAt", Query.Direction.DESCENDING).startAfter(cursor).limit(30).get()
            .addOnSuccessListener { snapshot ->
                oldestSpaceMessageDocument = snapshot.documents.lastOrNull() ?: oldestSpaceMessageDocument
                done(snapshot.documents.map { it.toSpaceMessage() }.reversed(), snapshot.size() == 30, null)
            }
            .addOnFailureListener { done(emptyList(), true, it.localizedMessage ?: "Older messages could not be loaded.") }
    }

    fun stopSpaceMessages(stopAccessListener: Boolean = true) {
        spaceMessagesListener?.remove()
        spaceMessagesListener = null
        oldestSpaceMessageDocument = null
        spaceMessageReadsListener?.remove()
        spaceMessageReadsListener = null
        spaceChatPresenceListener?.remove()
        spaceChatPresenceListener = null
        if (stopAccessListener) {
            spaceAccessListener?.remove()
            spaceAccessListener = null
            spaceChatRequestListener?.remove()
            spaceChatRequestListener = null
        }
    }

    fun listenSpaceAccess(spaceId: String, onAccess: (SpaceAccess?) -> Unit, onError: (String) -> Unit) {
        spaceAccessListener?.remove()
        val uid = auth.currentUser?.uid ?: return onAccess(null)
        spaceAccessListener = db.collection("communitySpaces").document(spaceId).collection("access").document(uid)
            .addSnapshotListener { snapshot, error ->
                if (error != null) return@addSnapshotListener onError(error.localizedMessage ?: "Messages access is unavailable.")
                onAccess(snapshot?.takeIf(DocumentSnapshot::exists)?.toSpaceAccess())
            }
    }

    fun listenSpaceChatRequest(spaceId: String, onPending: (Boolean) -> Unit, onError: (String) -> Unit) {
        spaceChatRequestListener?.remove()
        val uid = auth.currentUser?.uid ?: return onPending(false)
        spaceChatRequestListener = db.collection("communitySpaces").document(spaceId)
            .collection("chatAccessRequests").document(uid)
            .addSnapshotListener { snapshot, error ->
                if (error != null) return@addSnapshotListener onError(error.localizedMessage ?: "Messages access request is unavailable.")
                onPending(snapshot?.exists() == true && snapshot.getString("status") == "pending")
            }
    }

    fun listenSpaceMessageReads(spaceId: String, onItems: (List<SpaceMessageRead>) -> Unit, onError: (String) -> Unit) {
        spaceMessageReadsListener?.remove()
        spaceMessageReadsListener = db.collection("communitySpaces").document(spaceId).collection("messageReads")
            .orderBy("seenAt", Query.Direction.DESCENDING).limit(500)
            .addSnapshotListener { snapshot, error ->
                if (error != null) return@addSnapshotListener onError(error.localizedMessage ?: "Seen receipts are unavailable.")
                onItems(snapshot?.documents.orEmpty().map { it.toSpaceMessageRead() })
            }
    }

    fun listenSpaceChatPresence(spaceId: String, onItems: (List<SpaceChatPresence>) -> Unit, onError: (String) -> Unit) {
        spaceChatPresenceListener?.remove()
        spaceChatPresenceListener = db.collection("communitySpaces").document(spaceId).collection("chatPresence")
            .orderBy("activeAt", Query.Direction.DESCENDING).limit(24)
            .addSnapshotListener { snapshot, error ->
                if (error != null) return@addSnapshotListener onError(error.localizedMessage ?: "Chat presence is unavailable.")
                onItems(snapshot?.documents.orEmpty().map { it.toSpaceChatPresence() })
            }
    }

    fun updateSpaceChatPresence(spaceId: String) {
        val user = auth.currentUser ?: return
        db.collection("communitySpaces").document(spaceId).collection("chatPresence").document(user.uid)
            .set(mapOf("userId" to user.uid, "activeAt" to FieldValue.serverTimestamp()), SetOptions.merge())
    }

    fun enableSpaceMessages(space: CommunitySpace, done: (String?) -> Unit) {
        functions.getHttpsCallable("setCommunitySpaceConnection").call(mapOf("operation" to "enable_space_chat", "spaceId" to space.slug))
            .addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Messages could not be enabled.") }
    }

    fun uploadSpaceMessageImage(space: CommunitySpace, dataUrl: String, onProgress: (Int) -> Unit, done: (String?, String?) -> Unit) {
        val user = auth.currentUser ?: return done(null, "Sign in to send images.")
        val encoded = dataUrl.substringAfter("base64,", "")
        val bytes = runCatching { Base64.decode(encoded, Base64.DEFAULT) }.getOrNull()
            ?: return done(null, "The selected image could not be read.")
        if (bytes.isEmpty() || bytes.size > 8 * 1024 * 1024) return done(null, "Choose an image no larger than 8 MB.")
        val path = "community/space-messages/${space.slug}/${user.uid}/${UUID.randomUUID()}.jpg"
        val metadata = StorageMetadata.Builder().setContentType("image/jpeg").build()
        storage.reference.child(path).putBytes(bytes, metadata)
            .addOnProgressListener { snapshot ->
                onProgress(if (snapshot.totalByteCount > 0) ((snapshot.bytesTransferred * 100) / snapshot.totalByteCount).toInt() else 0)
            }
            .addOnSuccessListener { done(path, null) }
            .addOnFailureListener { done(null, it.localizedMessage ?: "Chat image could not be uploaded.") }
    }

    fun uploadSpaceMessageAudio(space: CommunitySpace, bytes: ByteArray, onProgress: (Int) -> Unit, done: (String?, String?) -> Unit) {
        val user = auth.currentUser ?: return done(null, "Sign in to send voice messages.")
        if (bytes.isEmpty() || bytes.size > 12 * 1024 * 1024) return done(null, "Voice messages must be no larger than 12 MB.")
        val path = "community/space-messages/${space.slug}/${user.uid}/${UUID.randomUUID()}.m4a"
        val metadata = StorageMetadata.Builder().setContentType("audio/mp4").build()
        storage.reference.child(path).putBytes(bytes, metadata)
            .addOnProgressListener { snapshot -> onProgress(if (snapshot.totalByteCount > 0) ((snapshot.bytesTransferred * 100) / snapshot.totalByteCount).toInt() else 0) }
            .addOnSuccessListener { done(path, null) }
            .addOnFailureListener { done(null, it.localizedMessage ?: "Voice message could not be uploaded.") }
    }

    fun sendSpaceMessage(space: CommunitySpace, text: String = "", replyToId: String = "", sharedPostId: String = "", imagePath: String = "", audioPath: String = "", audioDurationMs: Long = 0, done: (String?) -> Unit) {
        functions.getHttpsCallable("setCommunitySpaceConnection").call(mapOf(
            "operation" to "send_space_message", "spaceId" to space.slug, "text" to text,
            "replyToId" to replyToId, "sharedPostId" to sharedPostId, "imagePath" to imagePath, "audioPath" to audioPath, "audioDurationMs" to audioDurationMs,
        )).addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Message could not be sent.") }
    }

    fun reactToSpaceMessage(space: CommunitySpace, messageId: String, emoji: String, done: (String?) -> Unit) {
        functions.getHttpsCallable("setCommunitySpaceConnection").call(mapOf("operation" to "set_space_message_reaction", "spaceId" to space.slug, "messageId" to messageId, "emoji" to emoji))
            .addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Message reaction could not be updated.") }
    }

    fun loadSpaceMessageReactions(space: CommunitySpace, messageId: String, done: (List<SpaceMessageReaction>, String?) -> Unit) {
        db.collection("communitySpaces").document(space.slug).collection("messages").document(messageId).collection("reactions").get()
            .addOnSuccessListener { snapshot -> done(snapshot.documents.map { SpaceMessageReaction(it.getString("userId").orEmpty().ifBlank { it.id }, it.getString("emoji").orEmpty()) }, null) }
            .addOnFailureListener { done(emptyList(), it.localizedMessage ?: "Message reactions could not be loaded.") }
    }

    fun requestSpaceChatAccess(space: CommunitySpace, done: (String?) -> Unit) {
        functions.getHttpsCallable("setCommunitySpaceConnection").call(mapOf("operation" to "request_space_chat_access", "spaceId" to space.slug))
            .addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Messages access request could not be sent.") }
    }

    fun reviewSpaceChatAccess(space: CommunitySpace, userId: String, approved: Boolean, ban: Boolean = false, done: (String?) -> Unit) {
        functions.getHttpsCallable("setCommunitySpaceConnection").call(mapOf("operation" to "review_space_chat_access", "spaceId" to space.slug, "userId" to userId, "approved" to approved, "ban" to ban))
            .addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Messages access request could not be reviewed.") }
    }

    fun loadSpaceChatMemberIds(space: CommunitySpace, done: (Set<String>) -> Unit) {
        val ids = mutableSetOf<String>().apply { if (space.creatorId.isNotBlank()) add(space.creatorId) }
        var completed = 0
        fun finish() { completed += 1; if (completed == 2) done(ids.toSet()) }
        db.collection("communitySpaces").document(space.slug).collection("connections").get()
            .addOnSuccessListener { snapshot -> snapshot.documents.map { it.getString("userId").orEmpty().ifBlank { it.id } }.filterTo(ids, String::isNotBlank); finish() }
            .addOnFailureListener { finish() }
        db.collection("communitySpaces").document(space.slug).collection("admins").get()
            .addOnSuccessListener { snapshot -> snapshot.documents.map { it.getString("userId").orEmpty().ifBlank { it.id } }.filterTo(ids, String::isNotBlank); finish() }
            .addOnFailureListener { finish() }
    }

    fun kickSpaceChatMember(space: CommunitySpace, userId: String, reason: String, done: (String?) -> Unit) {
        functions.getHttpsCallable("setCommunitySpaceConnection").call(mapOf(
            "operation" to "kick_space_chat", "spaceId" to space.slug, "userId" to userId, "reason" to reason,
        )).addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Chat access could not be changed.") }
    }

    fun blockSpaceUser(space: CommunitySpace, userId: String, reason: String, done: (String?) -> Unit) {
        functions.getHttpsCallable("setCommunitySpaceConnection").call(mapOf(
            "operation" to "block_space_user",
            "spaceId" to space.slug, "userId" to userId, "reason" to reason,
        )).addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Space access could not be changed.") }
    }

    fun unblockSpaceUser(space: CommunitySpace, userId: String, done: (String?) -> Unit) {
        functions.getHttpsCallable("setCommunitySpaceConnection").call(mapOf(
            "operation" to "unblock_space_user", "spaceId" to space.slug, "userId" to userId,
        )).addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Space access could not be changed.") }
    }

    fun markSpaceMessagesSeen(space: CommunitySpace, messageId: String, done: (String?) -> Unit = {}) {
        functions.getHttpsCallable("setCommunitySpaceConnection").call(mapOf("operation" to "mark_space_messages_seen", "spaceId" to space.slug, "messageId" to messageId))
            .addOnSuccessListener { done(null) }.addOnFailureListener { done(it.localizedMessage ?: "Seen receipt could not be updated.") }
    }

    fun editSpaceMessage(space: CommunitySpace, messageId: String, text: String, done: (String?) -> Unit) {
        functions.getHttpsCallable("setCommunitySpaceConnection").call(mapOf("operation" to "edit_space_message", "spaceId" to space.slug, "messageId" to messageId, "text" to text))
            .addOnSuccessListener { done(null) }.addOnFailureListener { done(it.localizedMessage ?: "Message could not be edited.") }
    }

    fun deleteSpaceMessage(space: CommunitySpace, messageId: String, done: (String?) -> Unit) {
        functions.getHttpsCallable("setCommunitySpaceConnection").call(mapOf("operation" to "delete_space_message", "spaceId" to space.slug, "messageId" to messageId))
            .addOnSuccessListener { done(null) }.addOnFailureListener { done(it.localizedMessage ?: "Message could not be deleted.") }
    }

    fun reviewSpaceRequest(space: CommunitySpace, userId: String, approved: Boolean, done: (String?) -> Unit) {
        functions.getHttpsCallable("setCommunitySpaceConnection").call(mapOf(
            "operation" to "review_space_connection", "spaceId" to space.slug, "userId" to userId, "approved" to approved,
        )).addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Request could not be reviewed.") }
    }

    fun removeSpaceMember(space: CommunitySpace, userId: String, done: (String?) -> Unit) {
        auth.currentUser ?: return done("Sign in to manage spaces.")
        functions.getHttpsCallable("removeCommunitySpaceMember").call(mapOf("spaceId" to space.slug, "userId" to userId))
            .addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Member access could not be removed.") }
    }

    private fun deletePostDocuments(documents: List<DocumentSnapshot>, start: Int = 0, done: (String?) -> Unit) {
        if (start >= documents.size) return done(null)
        val end = minOf(start + 450, documents.size)
        val batch = db.batch()
        documents.subList(start, end).forEach { batch.delete(it.reference) }
        batch.commit().addOnSuccessListener { deletePostDocuments(documents, end, done) }
            .addOnFailureListener { done(it.localizedMessage ?: "Your posts could not be deleted from this space.") }
    }

    fun connectUser(targetId: String, connected: Boolean, done: (String?) -> Unit) {
        val user = auth.currentUser ?: return done("Sign in to connect with people.")
        if (targetId.isBlank() || targetId == user.uid) return done("Choose another community member.")
        val mine = db.collection("users").document(user.uid).collection("connections").document(targetId)
        val follower = db.collection("users").document(targetId).collection("followers").document(user.uid)
        val batch = db.batch()
        if (connected) {
            val record = mapOf("userId" to user.uid, "targetUserId" to targetId, "createdAt" to FieldValue.serverTimestamp())
            batch.set(mine, record); batch.set(follower, record)
        } else { batch.delete(mine); batch.delete(follower) }
        batch.commit().addOnSuccessListener {
            updateConnectionNotification(targetId, "connection", targetId, "New connection", connected)
            done(null)
        }.addOnFailureListener { done(it.localizedMessage ?: "Connection could not be updated.") }
    }

    private fun updateConnectionNotification(recipientId: String, type: String, detailId: String, title: String, connected: Boolean) {
        val user = auth.currentUser ?: return
        if (recipientId.isBlank() || recipientId == user.uid) return
        val ref = db.collection("users").document(recipientId).collection("notifications").document("${type}_${detailId}_${user.uid}")
        if (!connected) { ref.delete(); return }
        db.collection("users").document(user.uid).get().addOnSuccessListener { profile ->
            ref.set(mapOf(
                "recipientId" to recipientId, "actorId" to user.uid,
                "actorName" to (profile.getString("displayName") ?: "Community member"),
                "actorUsername" to (profile.getString("username") ?: ""), "type" to type,
                "postId" to "", "postTitle" to title.take(160), "detailId" to detailId,
                "read" to false, "createdAt" to FieldValue.serverTimestamp(),
            ))
        }
    }

    fun loadConnectedSpaces(done: (Set<String>) -> Unit) {
        val uid = auth.currentUser?.uid ?: return done(emptySet())
        db.collection("users").document(uid).collection("connectedSpaces").get()
            .addOnSuccessListener { done(it.documents.map { item -> item.id }.toSet()) }
            .addOnFailureListener { done(emptySet()) }
    }

    fun listenConnections(userId: String?, onSpaces: (Set<String>) -> Unit, onChatSpaces: (Set<String>) -> Unit, onUsers: (Set<String>) -> Unit) {
        connectedSpacesListener?.remove()
        connectedUsersListener?.remove()
        connectedSpacesListener = null
        connectedUsersListener = null
        if (userId == null) {
            onSpaces(emptySet())
            onChatSpaces(emptySet())
            onUsers(emptySet())
            return
        }
        connectedSpacesListener = db.collection("users").document(userId).collection("connectedSpaces")
            .addSnapshotListener { snapshot, _ ->
                val documents = snapshot?.documents.orEmpty()
                onSpaces(documents.map { it.id }.toSet())
                onChatSpaces(documents.filter { it.getBoolean("chatAccessApproved") != false }.map { it.id }.toSet())
            }
        connectedUsersListener = db.collection("users").document(userId).collection("connections")
            .addSnapshotListener { snapshot, _ -> onUsers(snapshot?.documents.orEmpty().map { it.id }.toSet()) }
    }

    fun loadConnectedUsers(done: (Set<String>) -> Unit) {
        val uid = auth.currentUser?.uid ?: return done(emptySet())
        db.collection("users").document(uid).collection("connections").get()
            .addOnSuccessListener { done(it.documents.map { item -> item.id }.toSet()) }
            .addOnFailureListener { done(emptySet()) }
    }

    private fun storeImage(path: String, value: String, done: (String, String?) -> Unit) {
        if (value.startsWith("https://")) return done(value, null)
        val ref = storage.reference.child(path)
        if (value.isBlank()) {
            ref.delete().addOnCompleteListener { done("", null) }
            return
        }
        val encoded = value.substringAfter("base64,", "")
        val bytes = runCatching { Base64.decode(encoded, Base64.DEFAULT) }.getOrNull()
            ?: return done("", "The selected image could not be read.")
        val metadata = StorageMetadata.Builder().setContentType("image/jpeg").build()
        ref.putBytes(bytes, metadata).addOnSuccessListener {
            ref.downloadUrl.addOnSuccessListener { done(it.toString(), null) }
                .addOnFailureListener { error -> done("", error.localizedMessage ?: "Image URL could not be created.") }
        }.addOnFailureListener { done("", it.localizedMessage ?: "Image could not be uploaded.") }
    }

    fun updateProfile(displayName: String, school: String, city: String, bio: String, interests: String, photoBase64: String, bannerBase64: String, done: (String?) -> Unit) {
        val uid = auth.currentUser?.uid ?: return done("Sign in to edit your profile.")
        storeImage("community/profiles/$uid/avatar", photoBase64) { photoUrl, photoError ->
            if (photoError != null) return@storeImage done(photoError)
            storeImage("community/profiles/$uid/banner", bannerBase64) { bannerUrl, bannerError ->
                if (bannerError != null) return@storeImage done(bannerError)
        db.collection("users").document(uid).set(mapOf(
            "displayName" to displayName.trim(),
            "school" to school.trim(),
            "city" to city.trim(),
            "bio" to bio.trim(),
            "interests" to interests.trim(),
            "photoBase64" to "",
            "bannerBase64" to "",
            "photoURL" to photoUrl,
            "bannerURL" to bannerUrl,
            "profileComplete" to true,
            "updatedAt" to FieldValue.serverTimestamp(),
        ), SetOptions.merge()).addOnSuccessListener { done(null) }
            .addOnFailureListener { done(it.localizedMessage ?: "Profile could not be updated.") }
            }
        }
    }
}

class CommunityViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = FirebaseCommunityRepository.createOrNull(application)
    private var authListener: FirebaseAuth.AuthStateListener? = null
    private var notificationSnapshotInitialized = false
    private val chatPresenceHandler = Handler(Looper.getMainLooper())
    private var chatPresenceRunnable: Runnable? = null
    private var spaceMessageStreamsActive = false

    val firebaseConfigured = repository != null
    var currentUser by mutableStateOf<FirebaseUser?>(repository?.currentUser())
        private set
    var posts by mutableStateOf<List<CommunityPost>>(emptyList())
        private set
    private var publicFeedPosts by mutableStateOf<List<CommunityPost>>(emptyList())
    private var selectedSpacePosts by mutableStateOf<List<CommunityPost>>(emptyList())
    var spaces by mutableStateOf<List<CommunitySpace>>(emptyList())
        private set
    var members by mutableStateOf<Map<String, Member>>(emptyMap())
        private set
    var promptPostId by mutableStateOf<String?>(null)
        private set
    var connectedSpaces by mutableStateOf<Set<String>>(emptySet())
        private set
    var chatApprovedSpaces by mutableStateOf<Set<String>>(emptySet())
        private set
    var activeSpaceAccess by mutableStateOf(SpaceAccess())
        private set
    var activeSpaceAccessLoaded by mutableStateOf(false)
        private set
    var activeSpaceChatRequestPending by mutableStateOf(false)
        private set
    var spaceAccessBySlug by mutableStateOf<Map<String, SpaceAccess>>(emptyMap())
        private set
    var connectedUsers by mutableStateOf<Set<String>>(emptySet())
        private set
    var spaceRequestStatuses by mutableStateOf<Map<String, String>>(emptyMap())
        private set
    var managedSpaceIds by mutableStateOf<Set<String>>(emptySet())
        private set
    var blockedSpaceIds by mutableStateOf<Set<String>>(emptySet())
        private set
    var chatLatestMessages by mutableStateOf<Map<String, SpaceMessage>>(emptyMap())
        private set
    var notifications by mutableStateOf<List<CommunityNotification>>(emptyList())
        private set
    var archivedPosts by mutableStateOf<List<CommunityPost>>(emptyList())
        private set
    var archivedPostsLoading by mutableStateOf(false)
        private set
    var spaceMessages by mutableStateOf<List<SpaceMessage>>(emptyList())
        private set
    var spaceMessageReads by mutableStateOf<List<SpaceMessageRead>>(emptyList())
        private set
    var spaceChatPresence by mutableStateOf<List<SpaceChatPresence>>(emptyList())
        private set
    var spaceChatMemberIds by mutableStateOf<Set<String>>(emptySet())
        private set
    var spaceMessagesHasMore by mutableStateOf(true)
        private set
    var spaceMessagesLoadingOlder by mutableStateOf(false)
        private set
    var ownedSpacesOnly by mutableStateOf(false)
    var discoverFeed by mutableStateOf(true)
    var screen by mutableStateOf(CommunityScreen.HOME)
    var messagesReturnScreen by mutableStateOf(CommunityScreen.HOME)
        private set
    var sort by mutableStateOf(FeedSort.RECOMMENDED)
    var filter by mutableStateOf(PostFilter.ALL)
    private var selectedSpaceState by mutableStateOf<String?>(null)
    var selectedSpace: String?
        get() = selectedSpaceState
        set(value) {
            selectedSpaceState = value
            repository?.listenSelectedSpacePosts(value, { incoming ->
                selectedSpacePosts = incoming
                mergeVisiblePostSources()
            }, { showMessage(it) })
            if (value == null) {
                selectedSpacePosts = emptyList()
                mergeVisiblePostSources()
            }
        }
    var search by mutableStateOf("")
    var busy by mutableStateOf(false)
        private set
    var message by mutableStateOf<String?>(null)
        private set

    init {
        repository?.let { repo ->
            authListener = repo.addAuthListener { user ->
                currentUser = user
                managedSpaceIds = emptySet()
                blockedSpaceIds = emptySet()
                spaceAccessBySlug = emptyMap()
                notifications = emptyList()
                notificationSnapshotInitialized = false
                if (user != null) {
                    repo.syncGoogleUser(user) { error -> error?.let(::showMessage) }
                    CommunityPushRegistration.sync(getApplication())
                }
                repo.listenConnections(user?.uid, { connectedSpaces = it }, { chatApprovedSpaces = it }, { connectedUsers = it })
                repo.listenBlockedSpaceIds(user?.uid, ::applyBlockedSpaceIds, ::showMessage)
                refreshSpaceAccessRecords(repo)
                repo.listenCurrentProfile(user?.uid, { profile ->
                    if (profile != null) members = members + (profile.uid to profile)
                }, { showMessage(it) })
                repo.loadManagedSpaceIds(spaces) { ids -> managedSpaceIds = ids }
                repo.listenNotifications(user?.uid, { incoming ->
                    val previousIds = notifications.mapTo(mutableSetOf()) { it.id }
                    notifications = incoming
                    if (notificationSnapshotInitialized) {
                        incoming.filter { !it.read && it.id !in previousIds }.forEach {
                            CommunityNativeNotifications.showCommunityItem(getApplication(), it)
                        }
                    } else notificationSnapshotInitialized = true
                }, { showMessage(it) })
                discoverFeed = user == null
                refreshAllMeta()
            }
            repo.start(
                onPosts = { incoming ->
                    publicFeedPosts = incoming
                    mergeVisiblePostSources()
                    refreshAllMeta()
                },
                onSpaces = {
                    spaces = it.sortedBy { item -> item.name.lowercase() }
                    repo.loadSpaceRequestStatuses(spaces) { statuses -> spaceRequestStatuses = statuses }
                    repo.loadManagedSpaceIds(spaces) { ids -> managedSpaceIds = ids }
                    refreshSpaceAccessRecords(repo)
                },
                onMembers = { members = it },
                onPromptPostId = { promptPostId = it },
                onError = { showMessage(it) },
            )
        }
    }

    val currentProfile: Member?
        get() = currentUser?.uid?.let(members::get)

    val questionOfTheWeek: CommunityPost?
        get() = promptPostId?.let { id -> posts.firstOrNull { it.id == id && it.type == "question" && it.published && canViewPost(it) } }

    val unreadNotifications: Int get() = notifications.count { !it.read }

    val chatSpaces: List<CommunitySpace>
        get() = spaces.filter { space ->
            val access = spaceAccessBySlug[space.slug]
            space.chatEnabled && !isSpaceBlocked(space.slug) && (
                access?.chatBanned == true || access?.canUseChat == true ||
                    access == null && hasLegacyChatAccess(space)
                )
        }

    fun refreshChatInbox() = repository?.loadLatestChatMessages(chatSpaces) { chatLatestMessages = it }

    val selectedProjects: List<CommunityPost>
        get() = posts.filter { post ->
            post.type == "behance" && post.featured && post.published && !post.archived &&
                post.moderationStatus != "flagged" && canViewPost(post) &&
                (post.communitySlug == "main" || spaces.firstOrNull { it.slug == post.communitySlug }?.isPrivate != true)
        }.sortedByDescending { it.createdAt?.seconds ?: 0L }

    val visiblePosts: List<CommunityPost>
        get() {
            val selectedAreaAccessible = selectedSpace == null || spaces.firstOrNull { it.slug == selectedSpace }?.let(::canAccessSpace) == true
            var result = posts.filter { post ->
                selectedAreaAccessible && canViewPost(post) &&
                    (if (selectedSpace == null) {
                        val space = spaces.firstOrNull { it.slug == post.communitySlug }
                        post.communitySlug == "main" || (space?.isPrivate != true && space?.showInMainThread != false)
                    } else post.communitySlug == selectedSpace) &&
                    when (filter) {
                    PostFilter.ALL -> true
                    PostFilter.THOUGHTS -> post.type == "text"
                    PostFilter.QUESTIONS -> post.type == "question"
                    PostFilter.PROJECTS -> post.type == "behance"
                }
            }
            if (!discoverFeed && currentUser != null && selectedSpace == null) {
                result = result.filter { post ->
                    post.userId == currentUser?.uid ||
                        post.userId in connectedUsers ||
                        post.communitySlug in connectedSpaces ||
                        spaces.firstOrNull { it.slug == post.communitySlug }?.creatorId == currentUser?.uid
                }
            }
            return when (sort) {
                FeedSort.LATEST -> result.sortedByDescending { it.createdAt?.seconds ?: 0 }
                FeedSort.POPULAR -> result.sortedWith(compareByDescending<CommunityPost> { it.meta.score }.thenByDescending { it.createdAt?.seconds ?: 0 })
                FeedSort.RECOMMENDED -> result.sortedByDescending(::discoverScore)
            }
        }

    fun isSpaceBlocked(slug: String): Boolean = slug in blockedSpaceIds || spaceAccessBySlug[slug]?.blocked == true

    fun canAccessSpace(space: CommunitySpace): Boolean {
        if (isSpaceBlocked(space.slug)) return false
        spaceAccessBySlug[space.slug]?.let { return it.canReadPosts }
        return !space.isPrivate || space.creatorId == currentUser?.uid || space.slug in connectedSpaces
    }

    fun canViewPost(post: CommunityPost): Boolean {
        val space = spaces.firstOrNull { it.slug == post.communitySlug } ?: return post.communitySlug == "main"
        if (isSpaceBlocked(post.communitySlug)) return false
        spaceAccessBySlug[space.slug]?.let { return it.canReadPosts }
        return !space.isPrivate || space.creatorId == currentUser?.uid || space.slug in connectedSpaces || post.userId == currentUser?.uid
    }

    fun canManageSpace(slug: String): Boolean = slug in managedSpaceIds

    private fun hasLegacyChatAccess(space: CommunitySpace): Boolean =
        space.creatorId == currentUser?.uid || space.slug in managedSpaceIds || space.slug in chatApprovedSpaces

    fun canAccessSpaceMessages(space: CommunitySpace): Boolean {
        if (!space.chatEnabled || isSpaceBlocked(space.slug)) return false
        if (space.slug == selectedSpace && screen == CommunityScreen.MESSAGES && activeSpaceAccessLoaded) {
            return activeSpaceAccess.canUseChat
        }
        return spaceAccessBySlug[space.slug]?.canUseChat ?: hasLegacyChatAccess(space)
    }

    private fun refreshSpaceAccessRecords(repo: FirebaseCommunityRepository) {
        repo.listenSpaceAccessRecords(currentUser?.uid, spaces.map { it.slug }, { records ->
            spaceAccessBySlug = records
            closeBlockedSelectedSpaceIfNeeded()
        }, ::showMessage)
    }

    private fun applyBlockedSpaceIds(ids: Set<String>) {
        blockedSpaceIds = ids
        closeBlockedSelectedSpaceIfNeeded()
    }

    private fun closeBlockedSelectedSpaceIfNeeded() {
        val slug = selectedSpace ?: return
        if (!isSpaceBlocked(slug)) return
        val wasMessages = screen == CommunityScreen.MESSAGES
        closeSpaceMessages()
        selectedSpace = null
        if (wasMessages) screen = messagesReturnScreen
        showMessage("You are blocked from this space.")
    }

    private fun discoverScore(post: CommunityPost): Double {
        val created = post.createdAt?.seconds ?: 0
        val ageHours = max(0.0, System.currentTimeMillis() / 1000.0 - created) / 3600.0
        val freshness = 72.0 / (1 + ageHours / 18)
        val applause = log2(max(0, post.meta.score) + 1.0) * 17
        val conversation = log2(post.meta.commentsCount + 1.0) * 14
        return freshness + applause + conversation + (if (post.featured) 18 else 0) + (if (post.type == "question") 6 else 0)
    }

    private fun log2(value: Double) = ln(value) / ln(2.0)

    private fun refreshAllMeta() {
        val repo = repository ?: return
        val snapshot = posts
        snapshot.forEach { post ->
            repo.loadPostMeta(post, currentUser?.uid) { meta ->
                posts = posts.map { if (it.id == post.id) it.copy(meta = meta) else it }
            }
        }
    }

    private fun mergeVisiblePostSources() {
        posts = (publicFeedPosts + selectedSpacePosts).distinctBy { it.id }
    }

    fun signIn(email: String, password: String) = run { repository?.signIn(email, password, it) }
    fun register(email: String, password: String, name: String, username: String) = run { repository?.register(email, password, name, username, it) }
    fun resetPassword(email: String) = run(successMessage = "Password reset email sent.") { repository?.sendPasswordReset(email, it) }
    fun signOut() = repository?.signOut()
    fun syncNativeNotifications(done: (String?) -> Unit = {}) =
        CommunityPushRegistration.sync(getApplication(), done)
    fun signInWithGoogle(idToken: String) = run { repository?.signInWithGoogle(idToken, it) }

    fun checkUsernameAvailability(username: String, done: (Boolean, String?) -> Unit) =
        repository?.checkUsernameAvailability(username, done) ?: done(false, "Firebase is not connected.")

    fun checkSpaceHandleAvailability(slug: String, done: (Boolean, String?) -> Unit) =
        repository?.checkSpaceHandleAvailability(slug, done) ?: done(false, "Firebase is not connected.")

    fun completeGoogleProfile(username: String, name: String, school: String, city: String, bio: String, done: (Boolean) -> Unit) {
        run(successMessage = "Community profile completed.") { complete ->
            repository?.completeGoogleProfile(username, name, school, city, bio) { error ->
                complete(error)
                done(error == null)
            }
        }
    }

    fun publish(type: String, title: String, content: String, behance: String, space: String, images: List<String>, done: (Boolean) -> Unit) {
        val profile = currentProfile ?: return showMessage("Complete your profile before publishing.")
        if (type != "behance" && !canPostToSpace(space)) {
            showMessage("You can only post in spaces you own or are connected to.")
            done(false)
            return
        }
        run(successMessage = "Your post is live.") { complete ->
            repository?.createPost(type, title, content, behance, space, profile, images) { error ->
                complete(error)
                done(error == null)
            }
        }
    }

    fun updatePost(post: CommunityPost, title: String, content: String, behance: String, done: (Boolean) -> Unit) =
        run(successMessage = "Post updated.") { complete ->
            repository?.updatePost(post, title, content, behance) { error -> complete(error); done(error == null) }
        }

    fun deletePost(post: CommunityPost, done: (Boolean) -> Unit) =
        run(successMessage = "Post deleted.") { complete ->
            repository?.deletePost(post) { error -> complete(error); done(error == null) }
        }

    fun loadArchivedPosts() {
        archivedPostsLoading = true
        repository?.loadEligibleArchivedPosts { incoming, error ->
            archivedPostsLoading = false
            if (error != null) showMessage(error) else archivedPosts = incoming
        } ?: run { archivedPostsLoading = false; showMessage("Firebase is not connected.") }
    }

    fun repostArchivedPost(post: CommunityPost, done: (Boolean) -> Unit) {
        run(successMessage = "A new copy was posted in the main thread.") { complete ->
            repository?.repostArchivedPost(post) { newPostId, error ->
                complete(error)
                if (error == null) {
                    archivedPosts = archivedPosts.map { if (it.id == post.id) it.copy(repostedPostId = newPostId.orEmpty()) else it }
                    done(true)
                } else done(false)
            }
        }
    }

    fun vote(post: CommunityPost, requested: Int) {
        if (currentUser == null) return showMessage("Sign in to react to community posts.")
        val previous = post.meta
        val value = if (post.meta.mine == requested) 0 else requested
        val optimistic = previous.copy(score = previous.score + value - previous.mine, mine = value)
        posts = posts.map { if (it.id == post.id) it.copy(meta = optimistic) else it }
        repository?.vote(post, value) { error ->
            if (error != null) {
                posts = posts.map { if (it.id == post.id) it.copy(meta = previous) else it }
                showMessage(error)
            } else refreshMeta(post.copy(meta = optimistic))
        } ?: showMessage("Connect Firebase before reacting.")
    }

    fun comments(post: CommunityPost, done: (List<CommunityComment>, String?) -> Unit) = repository?.loadComments(post.id, done) ?: done(emptyList(), "Firebase is not connected.")

    fun addComment(post: CommunityPost, text: String, parent: CommunityComment?, done: (Boolean) -> Unit) {
        repository?.addComment(post, text, parent?.id, parent?.userId, currentProfile?.displayName.orEmpty()) { error ->
            if (error != null) showMessage(error) else refreshMeta(post)
            done(error == null)
        }
    }

    fun updateComment(post: CommunityPost, comment: CommunityComment, text: String, done: (Boolean) -> Unit) {
        repository?.updateComment(post.id, comment.id, text) { error -> error?.let(::showMessage); done(error == null) } ?: done(false)
    }

    fun deleteComment(post: CommunityPost, comment: CommunityComment, done: (Boolean) -> Unit) {
        repository?.deleteComment(post.id, comment.id) { error -> error?.let(::showMessage); done(error == null) } ?: done(false)
    }

    fun createSpace(name: String, slug: String, description: String, imageBase64: String = "", bannerBase64: String = "", isPrivate: Boolean = false, isViewOnly: Boolean = false, showInMainThread: Boolean = true, done: (Boolean) -> Unit) {
        val profile = currentProfile ?: return showMessage("Complete your profile before creating a space.")
        val restricted = !profile.mainThreadPostingAccess
        run(successMessage = "Space created.") { complete ->
            repository?.createSpace(name, slug, description, profile, imageBase64, bannerBase64, isPrivate || restricted, isViewOnly && !restricted && !isPrivate, showInMainThread && !restricted) { error -> complete(error); done(error == null) }
        }
    }

    fun requestMainThreadPostingAccess(done: (Boolean) -> Unit) {
        repository?.requestMainThreadPostingAccess { error ->
            error?.let(::showMessage) ?: showMessage("Your posting-access request was sent.")
            done(error == null)
        } ?: done(false)
    }

    fun updateSpace(space: CommunitySpace, name: String, description: String, imageBase64: String, bannerBase64: String, isPrivate: Boolean, isViewOnly: Boolean, showInMainThread: Boolean, done: (Boolean) -> Unit) {
        run(successMessage = "Space updated.") { complete ->
            repository?.updateSpace(space, name, description, imageBase64, bannerBase64, isPrivate, isViewOnly, showInMainThread) { error -> complete(error); done(error == null) }
        }
    }

    fun updateSpaceVisibility(space: CommunitySpace, isPrivate: Boolean, isViewOnly: Boolean, showInMainThread: Boolean, done: (Boolean) -> Unit) {
        run(successMessage = "Space settings updated.") { complete ->
            repository?.updateSpaceVisibility(space, isPrivate, isViewOnly, showInMainThread) { error -> complete(error); done(error == null) }
        }
    }

    fun deleteSpace(space: CommunitySpace, done: (Boolean) -> Unit) {
        run(successMessage = "Space deleted. Its existing posts remain in the main feed.") { complete ->
            repository?.deleteSpace(space) { error -> complete(error); done(error == null) }
        }
    }

    fun canPostToSpace(slug: String): Boolean {
        val publicAccess = currentProfile?.mainThreadPostingAccess == true
        if (slug == "main") return publicAccess
        return spaces.any {
            it.slug == slug && (it.creatorId == currentUser?.uid || it.slug in connectedSpaces) && (publicAccess || it.isPrivate)
        }
    }

    fun connectSpace(space: CommunitySpace) {
        if (space.slug in connectedSpaces || space.creatorId == currentUser?.uid) return
        repository?.connectSpace(space, true) { error ->
            if (error != null) showMessage(error)
            else if (space.isPrivate || space.isViewOnly) {
                spaceRequestStatuses = spaceRequestStatuses + (space.slug to "pending")
                showMessage("Access request sent to the space administrators.")
            } else connectedSpaces = connectedSpaces + space.slug
        }
    }

    fun loadSpaceManagement(space: CommunitySpace, done: (SpaceManagement, String?) -> Unit) =
        repository?.loadSpaceManagement(space, done) ?: done(SpaceManagement(), "Firebase is not connected.")

    fun reviewSpaceRequest(space: CommunitySpace, userId: String, approved: Boolean, done: (Boolean) -> Unit) {
        repository?.reviewSpaceRequest(space, userId, approved) { error ->
            error?.let(::showMessage)
            done(error == null)
        } ?: done(false)
    }

    fun requestSpaceChatAccess(space: CommunitySpace) {
        repository?.requestSpaceChatAccess(space) { error ->
            if (error != null) showMessage(error) else {
                activeSpaceChatRequestPending = true
                showMessage("Messages access request sent to the space admin.")
            }
        }
    }

    fun reviewSpaceChatAccess(space: CommunitySpace, userId: String, approved: Boolean, ban: Boolean = false, done: (Boolean) -> Unit) {
        repository?.reviewSpaceChatAccess(space, userId, approved, ban) { error -> error?.let(::showMessage); done(error == null) } ?: done(false)
    }

    fun removeSpaceMember(space: CommunitySpace, userId: String, done: (Boolean) -> Unit) {
        repository?.removeSpaceMember(space, userId) { error ->
            error?.let(::showMessage)
            done(error == null)
        } ?: done(false)
    }

    fun setSpaceAdmin(space: CommunitySpace, userId: String, enabled: Boolean, done: (Boolean) -> Unit) {
        repository?.setSpaceAdmin(space, userId, enabled) { error ->
            error?.let(::showMessage)
            done(error == null)
        } ?: done(false)
    }

    fun warnSpaceMember(space: CommunitySpace, userId: String, reason: String, done: (Boolean) -> Unit) {
        repository?.warnSpaceMember(space, userId, reason) { error ->
            if (error == null) showMessage("Warning sent to the member.") else showMessage(error)
            done(error == null)
        } ?: done(false)
    }

    fun openSpaceMessages(space: CommunitySpace) {
        if (screen != CommunityScreen.MESSAGES) messagesReturnScreen = screen
        selectedSpace = space.slug
        screen = CommunityScreen.MESSAGES
        spaceMessages = emptyList()
        spaceMessagesHasMore = true
        spaceMessagesLoadingOlder = false
        spaceMessageReads = emptyList()
        spaceChatPresence = emptyList()
        spaceChatMemberIds = setOf(space.creatorId, currentUser?.uid.orEmpty()).filter(String::isNotBlank).toSet()
        activeSpaceAccess = SpaceAccess()
        activeSpaceAccessLoaded = false
        activeSpaceChatRequestPending = false
        repository?.listenSpaceChatRequest(space.slug, { pending ->
            if (selectedSpace == space.slug && screen == CommunityScreen.MESSAGES) activeSpaceChatRequestPending = pending
        }, ::showMessage)
        repository?.listenSpaceAccess(space.slug, { access ->
            if (selectedSpace != space.slug || screen != CommunityScreen.MESSAGES) return@listenSpaceAccess
            activeSpaceAccess = access ?: spaceAccessBySlug[space.slug] ?: SpaceAccess(
                member = space.slug in connectedSpaces,
                manager = canManageSpace(space.slug),
                canReadPosts = canAccessSpace(space),
                canUseChat = hasLegacyChatAccess(space),
            )
            activeSpaceAccessLoaded = true
            if (activeSpaceAccess.blocked) {
                blockedSpaceIds = blockedSpaceIds + space.slug
                closeBlockedSelectedSpaceIfNeeded()
            } else if (activeSpaceAccess.canUseChat) {
                startSpaceMessageStreams(space)
            } else {
                stopSpaceMessageStreams(keepAccessListener = true)
            }
        }, ::showMessage)
    }

    private fun startSpaceMessageStreams(space: CommunitySpace) {
        if (spaceMessageStreamsActive || selectedSpace != space.slug || screen != CommunityScreen.MESSAGES) return
        spaceMessageStreamsActive = true
        chatPresenceRunnable?.let(chatPresenceHandler::removeCallbacks)
        val heartbeat = object : Runnable {
            override fun run() {
                if (selectedSpace == space.slug && screen == CommunityScreen.MESSAGES) {
                    repository?.updateSpaceChatPresence(space.slug)
                    chatPresenceHandler.postDelayed(this, 45_000)
                }
            }
        }
        chatPresenceRunnable = heartbeat
        heartbeat.run()
        repository?.listenSpaceMessages(space.slug, { recent ->
            val recentIds = recent.mapTo(mutableSetOf()) { it.id }
            spaceMessages = spaceMessages.filterNot { it.id in recentIds } + recent
            spaceMessagesHasMore = recent.size == 30 || spaceMessages.size > recent.size
        }, { showMessage(it) })
        repository?.listenSpaceMessageReads(space.slug, { spaceMessageReads = it }, { showMessage(it) })
        repository?.listenSpaceChatPresence(space.slug, { spaceChatPresence = it }, { showMessage(it) })
        repository?.loadSpaceChatMemberIds(space) { spaceChatMemberIds = it + currentUser?.uid.orEmpty() }
    }

    private fun stopSpaceMessageStreams(keepAccessListener: Boolean) {
        repository?.stopSpaceMessages(stopAccessListener = !keepAccessListener)
        spaceMessageStreamsActive = false
        chatPresenceRunnable?.let(chatPresenceHandler::removeCallbacks)
        chatPresenceRunnable = null
        spaceMessages = emptyList()
        spaceMessagesHasMore = true
        spaceMessagesLoadingOlder = false
        spaceMessageReads = emptyList()
        spaceChatPresence = emptyList()
        spaceChatMemberIds = emptySet()
    }

    fun closeSpaceMessages() {
        stopSpaceMessageStreams(keepAccessListener = false)
    }

    fun returnFromSpaceMessages() {
        closeSpaceMessages()
        screen = messagesReturnScreen
    }

    fun loadOlderSpaceMessages(space: CommunitySpace) {
        if (spaceMessagesLoadingOlder || !spaceMessagesHasMore) return
        spaceMessagesLoadingOlder = true
        repository?.loadOlderSpaceMessages(space.slug) { older, hasMore, error ->
            spaceMessagesLoadingOlder = false
            spaceMessagesHasMore = hasMore
            if (error != null) showMessage(error)
            else if (older.isNotEmpty()) {
                val existing = spaceMessages.mapTo(mutableSetOf()) { it.id }
                spaceMessages = older.filterNot { it.id in existing } + spaceMessages
            }
        } ?: run { spaceMessagesLoadingOlder = false }
    }

    fun enableSpaceMessages(space: CommunitySpace, done: (Boolean) -> Unit) {
        repository?.enableSpaceMessages(space) { error ->
            if (error == null) {
                spaces = spaces.map { if (it.slug == space.slug) it.copy(chatEnabled = true) else it }
                showMessage("Messages enabled permanently.")
                openSpaceMessages(space.copy(chatEnabled = true))
            } else showMessage(error)
            done(error == null)
        } ?: done(false)
    }

    fun sendSpaceMessage(space: CommunitySpace, text: String, reply: SpaceMessage?, imageDataUrl: String = "", onProgress: (Int) -> Unit = {}, done: (Boolean) -> Unit) {
        val repo = repository ?: return done(false)
        fun send(imagePath: String = "") = repo.sendSpaceMessage(space, text = text, replyToId = reply?.id.orEmpty(), imagePath = imagePath) { error ->
            error?.let(::showMessage)
            done(error == null)
        }
        if (imageDataUrl.isBlank()) send() else repo.uploadSpaceMessageImage(space, imageDataUrl, onProgress) { path, error ->
            if (error != null || path == null) { showMessage(error ?: "Image upload failed."); done(false) }
            else send(path)
        }
    }

    fun sendSpaceVoiceMessage(space: CommunitySpace, text: String, reply: SpaceMessage?, bytes: ByteArray, durationMs: Long, onProgress: (Int) -> Unit = {}, done: (Boolean) -> Unit) {
        val repo = repository ?: return done(false)
        repo.uploadSpaceMessageAudio(space, bytes, onProgress) { path, uploadError ->
            if (uploadError != null || path == null) { showMessage(uploadError ?: "Voice upload failed."); done(false) }
            else repo.sendSpaceMessage(space, text = text, replyToId = reply?.id.orEmpty(), audioPath = path, audioDurationMs = durationMs) { error ->
                error?.let(::showMessage); done(error == null)
            }
        }
    }

    fun reactToSpaceMessage(space: CommunitySpace, messageId: String, emoji: String) {
        repository?.reactToSpaceMessage(space, messageId, emoji) { error -> error?.let(::showMessage) }
    }

    fun loadSpaceMessageReactions(space: CommunitySpace, messageId: String, done: (List<SpaceMessageReaction>) -> Unit) {
        repository?.loadSpaceMessageReactions(space, messageId) { reactions, error ->
            error?.let(::showMessage)
            done(reactions)
        } ?: done(emptyList())
    }

    fun sharePostToChat(post: CommunityPost, space: CommunitySpace, done: (Boolean) -> Unit = {}) {
        repository?.sendSpaceMessage(space, sharedPostId = post.id) { error ->
            if (error == null) showMessage("Post sent to ${space.name} messages.") else showMessage(error)
            done(error == null)
        } ?: done(false)
    }

    fun kickSpaceChatMember(space: CommunitySpace, userId: String, reason: String, done: (Boolean) -> Unit) {
        repository?.kickSpaceChatMember(space, userId, reason) { error ->
            if (error == null) showMessage("Member removed from chat only.") else showMessage(error)
            done(error == null)
        } ?: done(false)
    }

    fun blockSpaceUser(space: CommunitySpace, userId: String, reason: String, done: (Boolean) -> Unit) {
        repository?.blockSpaceUser(space, userId, reason) { error ->
            if (error == null) showMessage("User blocked from the space.") else showMessage(error)
            done(error == null)
        } ?: done(false)
    }

    fun unblockSpaceUser(space: CommunitySpace, userId: String, done: (Boolean) -> Unit) {
        repository?.unblockSpaceUser(space, userId) { error ->
            if (error == null) showMessage("User unblocked. They may request access again.") else showMessage(error)
            done(error == null)
        } ?: done(false)
    }

    fun markSpaceMessagesSeen(space: CommunitySpace, messageId: String) = repository?.markSpaceMessagesSeen(space, messageId)

    fun editSpaceMessage(space: CommunitySpace, messageId: String, text: String, done: (Boolean) -> Unit) {
        repository?.editSpaceMessage(space, messageId, text) { error -> error?.let(::showMessage); done(error == null) } ?: done(false)
    }

    fun deleteSpaceMessage(space: CommunitySpace, messageId: String, done: (Boolean) -> Unit) {
        repository?.deleteSpaceMessage(space, messageId) { error -> error?.let(::showMessage); done(error == null) } ?: done(false)
    }

    fun moderateSpacePost(post: CommunityPost, action: String, reason: String, done: (Boolean) -> Unit) {
        repository?.moderateSpacePost(post, action, reason) { error ->
            if (error == null) {
                if (action == "delete") posts = posts.filterNot { it.id == post.id }
                showMessage(if (action == "delete") "Post deleted." else "Post warning sent.")
            } else showMessage(error)
            done(error == null)
        } ?: done(false)
    }

    fun disconnectSpace(space: CommunitySpace) {
        if (space.slug !in connectedSpaces) return
        repository?.connectSpace(space, false) { error ->
            if (error != null) showMessage(error)
            else {
                connectedSpaces = connectedSpaces - space.slug
                chatApprovedSpaces = chatApprovedSpaces - space.slug
            }
        }
    }

    fun disconnectUser(userId: String) {
        repository?.connectUser(userId, false) { error ->
            if (error != null) showMessage(error) else connectedUsers = connectedUsers - userId
        }
    }

    fun toggleUserConnection(userId: String) {
        if (userId == currentUser?.uid) return
        val connect = userId !in connectedUsers
        repository?.connectUser(userId, connect) { error ->
            if (error != null) showMessage(error)
            else connectedUsers = if (connect) connectedUsers + userId else connectedUsers - userId
        }
    }

    fun markNotificationRead(item: CommunityNotification) = repository?.markNotificationRead(item.id) { it?.let(::showMessage) }

    fun markAllNotificationsRead() {
        val ids = notifications.filterNot { it.read }.map { it.id }
        if (ids.isEmpty()) return
        repository?.markAllNotificationsRead(ids) { it?.let(::showMessage) }
    }

    fun updateProfile(name: String, school: String, city: String, bio: String, interests: String, photoBase64: String, bannerBase64: String, done: (Boolean) -> Unit) = run(successMessage = "Profile updated.") { complete ->
        repository?.updateProfile(name, school, city, bio, interests, photoBase64, bannerBase64) { error -> complete(error); done(error == null) }
    }

    private fun refreshMeta(post: CommunityPost) = repository?.loadPostMeta(post, currentUser?.uid) { meta ->
        posts = posts.map { if (it.id == post.id) it.copy(meta = meta) else it }
    }

    private fun run(successMessage: String? = null, operation: ((String?) -> Unit) -> Unit) {
        if (repository == null) return showMessage("Firebase is not connected yet. Add androidApp/google-services.json.")
        busy = true
        operation { error ->
            busy = false
            message = error ?: successMessage
        }
    }

    fun showMessage(value: String) { message = value }
    fun clearMessage() { message = null }

    override fun onCleared() {
        repository?.removeAuthListener(authListener)
        repository?.stop()
    }
}

private fun normalizeSpaceHandle(value: String): String = value.trim().lowercase(Locale.US)
    .replace(Regex("^/?a/"), "")
    .replace(Regex("[\\s_]+"), "-")
    .replace(Regex("[^a-z0-9-]"), "")
    .replace(Regex("-+"), "-")
    .trim('-')

fun initials(value: String): String = value.trim().split(Regex("\\s+")).filter { it.isNotBlank() }.take(2)
    .joinToString("") { it.take(1).uppercase() }.ifBlank { "A" }
