@file:OptIn(ExperimentalMaterial3Api::class)

package com.aiasbsr.community

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Base64
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.File
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items as gridItems
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.ClickableText
import androidx.compose.foundation.text.KeyboardOptions
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import com.google.firebase.storage.FirebaseStorage
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.firebase.Timestamp
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential.Companion.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.DateFormat
import java.text.Normalizer
import java.util.Date
import java.util.Locale
import java.net.URL
import java.io.ByteArrayOutputStream
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.NotificationsNone
import androidx.compose.material.icons.filled.PersonOutline
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Tag

private val Burgundy = Color(0xFF661F22)
private val BurgundyDark = Color(0xFF3D1115)
private val Clay = Color(0xFF945C50)
private val Cream = Color(0xFFF6F3ED)
private val Paper = Color(0xFFFFFDFA)
private val Ink = Color(0xFF211A1B)
private val Muted = Color(0xFF71676A)
private val Line = Color(0xFFE8E0D8)
private val Gold = Color(0xFFF0DAA1)
private val SandLight = Color(0xFFFBF5E4)
private val QuestionTint = Color(0xFFFFFDFA)
private val FilterActive = Color(0xFFEADFDA)
private val SearchSurface = Color(0xFFEEEAE5)

private enum class AvailabilityState { IDLE, CHECKING, AVAILABLE, TAKEN, INVALID, ERROR }
private enum class SearchKind { SPACE, POST, MEMBER }

private data class AppSearchResult(
    val kind: SearchKind,
    val id: String,
    val title: String,
    val subtitle: String,
    val handle: String,
    val searchText: String,
    val sortTime: Long = 0,
    val space: CommunitySpace? = null,
    val post: CommunityPost? = null,
    val member: Member? = null,
)

private val ManropeFont = FontFamily(
    Font(R.font.manrope, FontWeight.Normal),
    Font(R.font.manrope, FontWeight.SemiBold),
    Font(R.font.manrope, FontWeight.Bold),
    Font(R.font.manrope, FontWeight.ExtraBold),
)
private val DmSansFont = FontFamily(
    Font(R.font.dm_sans, FontWeight.Normal),
    Font(R.font.dm_sans, FontWeight.Medium),
    Font(R.font.dm_sans, FontWeight.SemiBold),
    Font(R.font.dm_sans, FontWeight.Bold),
)
private val NotoArabicFont = FontFamily(
    Font(R.font.noto_sans_arabic, FontWeight.Normal),
    Font(R.font.noto_sans_arabic, FontWeight.Medium),
    Font(R.font.noto_sans_arabic, FontWeight.SemiBold),
    Font(R.font.noto_sans_arabic, FontWeight.Bold),
    Font(R.font.noto_sans_arabic, FontWeight.ExtraBold),
)

private fun communityTypography(arabic: Boolean): Typography {
    val body = if (arabic) NotoArabicFont else DmSansFont
    val display = if (arabic) NotoArabicFont else ManropeFont
    return Typography(
        bodyLarge = TextStyle(fontFamily = body, fontSize = 16.sp),
        bodyMedium = TextStyle(fontFamily = body, fontSize = 14.sp),
        bodySmall = TextStyle(fontFamily = body, fontSize = 12.sp),
        labelLarge = TextStyle(fontFamily = body, fontWeight = FontWeight.Bold, fontSize = 13.sp),
        titleMedium = TextStyle(fontFamily = display, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp),
        titleLarge = TextStyle(fontFamily = display, fontWeight = FontWeight.ExtraBold, fontSize = 23.sp),
        headlineMedium = TextStyle(fontFamily = display, fontWeight = FontWeight.ExtraBold, fontSize = 30.sp),
        headlineLarge = TextStyle(fontFamily = display, fontWeight = FontWeight.ExtraBold, fontSize = 34.sp),
    )
}

private val AIASColors = lightColorScheme(
    primary = Burgundy,
    onPrimary = Color.White,
    secondary = BurgundyDark,
    background = Cream,
    surface = Paper,
    onSurface = Ink,
    outline = Line,
    error = Color(0xFFB3261E),
)

@Composable
fun AIASCommunityApp(
    viewModel: CommunityViewModel = viewModel(),
    nativeNotificationTarget: NativeNotificationTarget? = null,
    onNativeNotificationConsumed: () -> Unit = {},
) {
    var arabic by rememberSaveable { mutableStateOf(false) }
    var commentsPost by remember { mutableStateOf<CommunityPost?>(null) }
    var showNotifications by remember { mutableStateOf(false) }
    var searchExpanded by remember { mutableStateOf(false) }
    var searchPost by remember { mutableStateOf<CommunityPost?>(null) }
    var searchMember by remember { mutableStateOf<Member?>(null) }
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current
    val focusManager = androidx.compose.ui.platform.LocalFocusManager.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var notificationPermissionRefresh by remember { mutableStateOf(0) }
    val notificationPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        CommunityPushRegistration.markPermissionAsked(context)
        notificationPermissionRefresh += 1
        if (granted) viewModel.syncNativeNotifications { error -> error?.let(viewModel::showMessage) }
        else viewModel.showMessage("Native notifications remain off. You can enable them later in Settings.")
    }
    val nativeNotificationsEnabled = notificationPermissionRefresh.let { CommunityPushRegistration.notificationsAllowed(context) }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                notificationPermissionRefresh += 1
                if (CommunityPushRegistration.notificationsAllowed(context)) viewModel.syncNativeNotifications()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    LaunchedEffect(viewModel.currentUser?.uid) {
        if (viewModel.currentUser == null) return@LaunchedEffect
        CommunityNativeNotifications.createChannel(context)
        when {
            CommunityPushRegistration.notificationsAllowed(context) -> viewModel.syncNativeNotifications()
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !CommunityPushRegistration.permissionWasAsked(context) -> {
                CommunityPushRegistration.markPermissionAsked(context)
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    LaunchedEffect(viewModel.message) {
        viewModel.message?.let {
            snackbar.showSnackbar(it)
            viewModel.clearMessage()
        }
    }

    LaunchedEffect(nativeNotificationTarget, viewModel.currentUser?.uid, viewModel.notifications, viewModel.posts, viewModel.members, viewModel.spaces) {
        val target = nativeNotificationTarget ?: return@LaunchedEffect
        if (viewModel.currentUser == null) return@LaunchedEffect
        val inboxItem = viewModel.notifications.firstOrNull { it.id == target.notificationId }
        val type = target.type.ifBlank { inboxItem?.type.orEmpty() }
        if (type.isBlank()) return@LaunchedEffect
        val postId = target.postId.ifBlank { inboxItem?.postId.orEmpty() }
        val detailId = target.detailId.ifBlank { inboxItem?.detailId.orEmpty() }
        val actorId = target.actorId.ifBlank { inboxItem?.actorId.orEmpty() }
        val handled = when (type) {
            "moderation_archived" -> {
                if (inboxItem?.eligibleToRepost == true) viewModel.screen = CommunityScreen.ARCHIVED
                else viewModel.screen = CommunityScreen.PROFILE
                true
            }
            "moderation_flagged", "moderation_cleared", "moderation_warned", "moderation_restored", "moderation_permanently_deleted" -> {
                viewModel.screen = CommunityScreen.PROFILE
                true
            }
            "connection" -> {
                viewModel.members[actorId]?.let { searchMember = it } ?: run { viewModel.screen = CommunityScreen.CONNECTIONS }
                true
            }
            "space_request" -> {
                viewModel.ownedSpacesOnly = true
                viewModel.screen = CommunityScreen.SPACES
                true
            }
            "space_connection" -> {
                viewModel.selectedSpace = detailId
                viewModel.screen = CommunityScreen.HOME
                true
            }
            "space_message" -> {
                val space = viewModel.spaces.firstOrNull { it.slug == detailId }
                if (space != null) viewModel.openSpaceMessages(space)
                space != null
            }
            "space_member_warned", "space_member_removed", "space_post_deleted", "space_chat_removed" -> {
                viewModel.selectedSpace = detailId
                viewModel.screen = CommunityScreen.HOME
                true
            }
            else -> {
                viewModel.posts.firstOrNull { it.id == postId }?.let { commentsPost = it }
                postId.isNotBlank() && commentsPost != null
            }
        }
        if (handled) {
            inboxItem?.let(viewModel::markNotificationRead)
            onNativeNotificationConsumed()
        }
    }

    val searchIsVisible = viewModel.screen == CommunityScreen.HOME || viewModel.screen == CommunityScreen.SPACES
    val immersiveScreen = viewModel.screen == CommunityScreen.MESSAGES ||
        (viewModel.screen == CommunityScreen.PROFILE && viewModel.currentProfile?.profileComplete != true)
    BackHandler(
        enabled = commentsPost != null ||
            searchExpanded ||
            (viewModel.screen == CommunityScreen.HOME && viewModel.selectedSpace != null) ||
            (searchIsVisible && viewModel.search.isNotBlank()) ||
            viewModel.screen != CommunityScreen.HOME,
    ) {
        when {
            commentsPost != null -> commentsPost = null
            searchExpanded -> { searchExpanded = false; viewModel.search = ""; focusManager.clearFocus() }
            viewModel.screen == CommunityScreen.HOME && viewModel.selectedSpace != null -> viewModel.selectedSpace = null
            viewModel.screen == CommunityScreen.MESSAGES -> viewModel.returnFromSpaceMessages()
            searchIsVisible && viewModel.search.isNotBlank() -> viewModel.search = ""
            viewModel.screen == CommunityScreen.SETTINGS -> viewModel.screen = CommunityScreen.PROFILE
            viewModel.screen == CommunityScreen.ARCHIVED -> viewModel.screen = CommunityScreen.SETTINGS
            viewModel.screen == CommunityScreen.CONNECTIONS -> viewModel.screen = CommunityScreen.SETTINGS
            viewModel.screen == CommunityScreen.SPACES && viewModel.ownedSpacesOnly -> { viewModel.ownedSpacesOnly = false; viewModel.screen = CommunityScreen.SETTINGS }
            viewModel.screen != CommunityScreen.HOME -> viewModel.screen = CommunityScreen.HOME
        }
    }

    MaterialTheme(colorScheme = AIASColors, typography = communityTypography(arabic)) {
        androidx.compose.runtime.CompositionLocalProvider(
            LocalLayoutDirection provides if (arabic) LayoutDirection.Rtl else LayoutDirection.Ltr,
        ) {
            Scaffold(
                modifier = Modifier.fillMaxSize(),
                containerColor = Cream,
                contentWindowInsets = WindowInsets(0),
                snackbarHost = { SnackbarHost(snackbar) },
                topBar = {
                    if (!immersiveScreen) CommunityTopBar(
                        screen = viewModel.screen,
                        inSpace = viewModel.selectedSpace != null,
                        search = viewModel.search,
                        onSearch = { viewModel.search = it },
                        onSearchFocus = { if (it) searchExpanded = true },
                        arabic = arabic,
                        onLanguage = { arabic = !arabic },
                        showSearch = viewModel.screen == CommunityScreen.HOME || viewModel.screen == CommunityScreen.SPACES,
                        signedIn = viewModel.currentUser != null,
                        unread = viewModel.unreadNotifications,
                        onNotifications = { showNotifications = true },
                    )
                },
                bottomBar = {
                    if (!immersiveScreen) CommunityNavigation(
                        selected = viewModel.screen,
                        arabic = arabic,
                        profile = viewModel.currentProfile,
                        onProfileLongPress = { viewModel.showMessage(tr(arabic, "Account switching is available from Settings.", "تبديل الحساب متاح من الإعدادات.")) },
                        onSelected = {
                            if (viewModel.screen == CommunityScreen.MESSAGES) viewModel.closeSpaceMessages()
                            searchExpanded = false
                            viewModel.search = ""
                            focusManager.clearFocus()
                            if (it == CommunityScreen.SPACES) viewModel.ownedSpacesOnly = false
                            viewModel.screen = it
                        },
                    )
                },
            ) { padding ->
                Box(Modifier.padding(padding).fillMaxSize().pointerInput(viewModel.screen, immersiveScreen) {
                    if (!immersiveScreen) {
                        var drag = 0f
                        detectHorizontalDragGestures(
                            onHorizontalDrag = { _, amount -> drag += amount },
                            onDragEnd = {
                                val pages = listOf(CommunityScreen.HOME, CommunityScreen.SPACES, CommunityScreen.CREATE, CommunityScreen.CHAT_INBOX, CommunityScreen.PROFILE)
                                val index = pages.indexOf(viewModel.screen)
                                if (index >= 0 && kotlin.math.abs(drag) > 110f) {
                                    viewModel.screen = pages[(index + if (drag < 0) 1 else -1).coerceIn(0, pages.lastIndex)]
                                }
                                drag = 0f
                            },
                        )
                    }
                }) {
                    when (viewModel.screen) {
                        CommunityScreen.HOME -> HomeScreen(viewModel, arabic, onComments = { commentsPost = it }, onMember = { searchMember = it })
                        CommunityScreen.SPACES -> SpacesScreen(viewModel, arabic)
                        CommunityScreen.SELECTED -> SelectedProjectsScreen(viewModel, arabic, onComments = { commentsPost = it }, onMember = { searchMember = it })
                        CommunityScreen.CREATE -> CreatePostScreen(viewModel, arabic)
                        CommunityScreen.PROFILE -> ProfileScreen(viewModel, arabic)
                        CommunityScreen.CONNECTIONS -> ConnectionsScreen(viewModel, arabic)
                        CommunityScreen.SETTINGS -> SettingsScreen(
                            viewModel,
                            arabic,
                            nativeNotificationsEnabled = nativeNotificationsEnabled,
                            onNativeNotifications = {
                                if (CommunityPushRegistration.notificationsAllowed(context)) {
                                    viewModel.syncNativeNotifications()
                                    context.startActivity(Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).apply {
                                        putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                                        putExtra(Settings.EXTRA_CHANNEL_ID, CommunityNativeNotifications.CHANNEL_ID)
                                    })
                                } else if (
                                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                                    (!CommunityPushRegistration.permissionWasAsked(context) ||
                                        (context as? Activity)?.shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS) == true)
                                ) {
                                    CommunityPushRegistration.markPermissionAsked(context)
                                    notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                                } else {
                                    context.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                                        putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                                    })
                                }
                            },
                        )
                        CommunityScreen.ARCHIVED -> ArchivedPostsScreen(viewModel, arabic)
                        CommunityScreen.CHAT_INBOX -> ChatInboxScreen(viewModel, arabic)
                        CommunityScreen.MESSAGES -> SpaceMessagesScreen(viewModel, arabic, onMember = { searchMember = it }, onPost = { searchPost = it })
                    }
                    if (searchIsVisible && searchExpanded) {
                        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .12f)).clickable {
                            searchExpanded = false
                            viewModel.search = ""
                            focusManager.clearFocus()
                        })
                        CommunitySearchPanel(
                            viewModel = viewModel,
                            query = viewModel.search,
                            onQuery = { viewModel.search = it },
                            arabic = arabic,
                            onSpace = { space ->
                                searchExpanded = false
                                viewModel.search = ""
                                focusManager.clearFocus()
                                viewModel.selectedSpace = space.slug
                                viewModel.screen = CommunityScreen.HOME
                            },
                            onPost = { post ->
                                searchExpanded = false
                                viewModel.search = ""
                                focusManager.clearFocus()
                                searchPost = post
                            },
                            onMember = { member ->
                                searchExpanded = false
                                viewModel.search = ""
                                focusManager.clearFocus()
                                searchMember = member
                            },
                        )
                    }
                    if (viewModel.busy) {
                        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .08f)), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = Burgundy)
                        }
                    }
                }
            }
            searchMember?.let { member ->
                MemberProfileSheet(member, viewModel, arabic, onDismiss = { searchMember = null }) { post ->
                    searchPost = post
                }
            }
            searchPost?.let { post ->
                FullScreenPostDialog(
                    post,
                    viewModel,
                    arabic,
                    returnToProfile = searchMember != null,
                    onBack = { searchPost = null },
                    onComments = { commentsPost = post },
                    onMember = { member -> searchPost = null; searchMember = member },
                    onSpace = { slug -> searchPost = null; searchMember = null; viewModel.selectedSpace = slug; viewModel.screen = CommunityScreen.HOME },
                )
            }
            commentsPost?.let { post ->
                CommentsSheet(post, viewModel, arabic, onDismiss = { commentsPost = null }, onMember = { member -> commentsPost = null; searchPost = null; searchMember = member })
            }
            if (showNotifications) NotificationSheet(viewModel, arabic, onDismiss = { showNotifications = false }) { item ->
                showNotifications = false
                viewModel.markNotificationRead(item)
                when (item.type) {
                    "moderation_archived" -> if (item.eligibleToRepost) viewModel.screen = CommunityScreen.ARCHIVED else viewModel.screen = CommunityScreen.PROFILE
                    "moderation_flagged", "moderation_cleared", "moderation_warned", "moderation_restored", "moderation_permanently_deleted" -> viewModel.screen = CommunityScreen.PROFILE
                    "connection" -> viewModel.screen = CommunityScreen.CONNECTIONS
                    "space_connection" -> { viewModel.selectedSpace = item.detailId; viewModel.screen = CommunityScreen.HOME }
                    "space_message" -> viewModel.spaces.firstOrNull { it.slug == item.detailId }?.let(viewModel::openSpaceMessages)
                    "space_member_warned", "space_member_removed", "space_post_deleted", "space_chat_removed" -> { viewModel.selectedSpace = item.detailId; viewModel.screen = CommunityScreen.HOME }
                    "space_request", "space_chat_request" -> { viewModel.ownedSpacesOnly = true; viewModel.screen = CommunityScreen.SPACES }
                    else -> viewModel.posts.firstOrNull { it.id == item.postId }?.let { commentsPost = it }
                }
            }
        }
    }
}

@Composable
private fun CommunityTopBar(
    screen: CommunityScreen,
    inSpace: Boolean,
    search: String,
    onSearch: (String) -> Unit,
    onSearchFocus: (Boolean) -> Unit,
    arabic: Boolean,
    onLanguage: () -> Unit,
    showSearch: Boolean,
    signedIn: Boolean,
    unread: Int,
    onNotifications: () -> Unit,
) {
    val title = when (screen) {
        CommunityScreen.HOME -> if (inSpace) tr(arabic, "Space", "المساحة") else tr(arabic, "Home", "الرئيسية")
        CommunityScreen.SPACES -> tr(arabic, "Spaces", "المساحات")
        CommunityScreen.SELECTED -> tr(arabic, "Selected projects", "المشاريع المختارة")
        CommunityScreen.CREATE -> tr(arabic, "Create", "إنشاء")
        CommunityScreen.PROFILE -> tr(arabic, "Profile", "الملف الشخصي")
        CommunityScreen.CONNECTIONS -> tr(arabic, "Connections", "التواصلات")
        CommunityScreen.SETTINGS -> tr(arabic, "Settings", "الإعدادات")
        CommunityScreen.ARCHIVED -> tr(arabic, "Archived posts", "المنشورات المؤرشفة")
        CommunityScreen.CHAT_INBOX -> tr(arabic, "Messages", "الرسائل")
        CommunityScreen.MESSAGES -> tr(arabic, "Conversation", "المحادثة")
    }
    Surface(
        color = Paper.copy(alpha = .96f),
        shape = RoundedCornerShape(0.dp, 0.dp, 20.dp, 20.dp),
        border = BorderStroke(1.dp, Line.copy(alpha = 0.6f)),
        shadowElevation = 3.dp,
    ) {
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().height(58.dp).padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                modifier = Modifier.size(38.dp).clip(RoundedCornerShape(13.dp)).background(Burgundy),
                contentAlignment = Alignment.Center,
            ) {
                Image(
                    painter = painterResource(R.drawable.aias_logo),
                    contentDescription = "AIAS Basra",
                    modifier = Modifier.size(36.dp).graphicsLayer(scaleX = 1.38f, scaleY = 1.38f),
                    contentScale = ContentScale.Crop,
                )
            }
            Column(Modifier.weight(1f)) {
                Text("AIAS BASRA", color = Burgundy, fontSize = 8.5.sp, fontWeight = FontWeight.Black, letterSpacing = 1.2.sp)
                Text(title, fontWeight = FontWeight.ExtraBold, fontSize = 17.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (showSearch) IconButton(onClick = { onSearchFocus(true) }, modifier = Modifier.size(40.dp)) {
                Icon(Icons.Default.Search, tr(arabic, "Search", "بحث"), tint = Ink)
            }
            if (signedIn) {
                Box(Modifier.size(40.dp).clip(CircleShape).clickable(onClick = onNotifications), contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.NotificationsNone, tr(arabic, "Notifications", "الإشعارات"), tint = Ink)
                    if (unread > 0) Surface(Modifier.align(Alignment.TopEnd), color = Burgundy, shape = CircleShape) {
                        Text(if (unread > 99) "99+" else unread.toString(), Modifier.padding(horizontal = 5.dp, vertical = 2.dp), color = Color.White, fontSize = 8.sp, fontWeight = FontWeight.ExtraBold)
                    }
                }
            }
            IconButton(onClick = onLanguage, modifier = Modifier.size(40.dp)) {
                Icon(Icons.Default.Language, tr(arabic, "Switch to English", "التبديل إلى العربية"), tint = Burgundy)
            }
        }
    }
}

private fun normalizeSearchText(value: String): String = Normalizer.normalize(value, Normalizer.Form.NFKD)
    .replace(Regex("[\\u0300-\\u036f]"), "")
    .lowercase(Locale.US)
    .replace(Regex("[^\\p{L}\\p{N}@/#_-]+"), " ")
    .trim()

private fun oneEditAway(left: String, right: String): Boolean {
    if (kotlin.math.abs(left.length - right.length) > 1) return false
    var i = 0
    var j = 0
    var edits = 0
    while (i < left.length && j < right.length) {
        if (left[i] == right[j]) { i += 1; j += 1; continue }
        edits += 1
        if (edits > 1) return false
        if (left.length > right.length) i += 1 else if (right.length > left.length) j += 1 else { i += 1; j += 1 }
    }
    return edits + (if (i < left.length || j < right.length) 1 else 0) <= 1
}

private fun searchResultScore(result: AppSearchResult, rawQuery: String): Int {
    val normalized = normalizeSearchText(rawQuery)
    val spaceOnly = normalized.startsWith("a/") || normalized.startsWith("#")
    val memberOnly = normalized.startsWith("p/") || normalized.startsWith("@")
    if (spaceOnly && result.kind != SearchKind.SPACE) return -1
    if (memberOnly && result.kind != SearchKind.MEMBER) return -1
    val query = normalized.replace(Regex("^(?:a/|p/|@|#)"), "").trim()
    if (query.isBlank()) return 1
    val terms = query.split(Regex("\\s+")).filter(String::isNotBlank)
    val handle = normalizeSearchText(result.handle)
    val title = normalizeSearchText(result.title)
    val text = normalizeSearchText(result.searchText)
    val words = text.split(Regex("\\s+")).filter(String::isNotBlank)
    var score = when (result.kind) { SearchKind.SPACE -> 8; SearchKind.POST -> 5; SearchKind.MEMBER -> 3 }
    score += when { handle == query -> 240; handle.startsWith(query) -> 150; handle.contains(query) -> 95; else -> 0 }
    score += when { title == query -> 180; title.startsWith(query) -> 115; title.contains(query) -> 75; else -> 0 }
    if (text.contains(query)) score += 55
    var misses = 0
    terms.forEach { term ->
        score += when {
            handle == term -> 70
            handle.startsWith(term) -> 48
            title.split(' ').any { it.startsWith(term) } -> 34
            text.contains(term) -> 20
            term.length >= 4 && words.any { oneEditAway(term, it) } -> 9
            else -> { misses += 1; 0 }
        }
    }
    if (misses == terms.size) return -1
    return score - misses * 18
}

private fun buildSearchResults(viewModel: CommunityViewModel, rawQuery: String): List<AppSearchResult> {
    val spaces = viewModel.spaces.filter { it.active && !viewModel.isSpaceBlocked(it.slug) }.map { space ->
        AppSearchResult(SearchKind.SPACE, space.slug, space.name.ifBlank { "a/${space.slug}" }, "a/${space.slug} · ${space.description}", space.slug, listOf(space.slug, space.name, space.description, space.creatorUsername).joinToString(" "), space.createdAt?.seconds ?: 0, space = space)
    }
    val posts = viewModel.posts.filter { it.published && viewModel.canViewPost(it) }.map { post ->
        val type = when (post.type) { "question" -> "Question"; "behance" -> "Project"; else -> "Thought" }
        val location = if (post.communitySlug == "main") "Main thread" else "a/${post.communitySlug}"
        AppSearchResult(SearchKind.POST, post.id, post.title.ifBlank { "Community post" }, "$type · $location · @${post.authorUsername.ifBlank { post.authorName }}", post.authorUsername, listOf(post.title, post.content, post.summary, post.authorName, post.authorUsername, post.communitySlug, type).joinToString(" "), post.createdAt?.seconds ?: 0, post = post)
    }
    val members = viewModel.members.values.filter { it.username.isNotBlank() }.map { member ->
        val place = member.school.ifBlank { member.city }
        AppSearchResult(SearchKind.MEMBER, member.uid, member.displayName.ifBlank { "@${member.username}" }, "p/${member.username}" + if (place.isBlank()) "" else " · $place", member.username, listOf(member.username, member.displayName, member.school, member.city, member.bio, member.interests).joinToString(" "), member = member)
    }
    val index = spaces + posts + members
    if (rawQuery.isBlank()) return spaces.sortedBy { it.title.lowercase() }.take(4) + posts.sortedByDescending { it.sortTime }.take(4)
    return index.map { it to searchResultScore(it, rawQuery) }
        .filter { it.second > 0 }
        .sortedWith(compareByDescending<Pair<AppSearchResult, Int>> { it.second }.thenByDescending { it.first.sortTime })
        .take(30).map { it.first }
}

@Composable
private fun CommunitySearchPanel(
    viewModel: CommunityViewModel,
    query: String,
    onQuery: (String) -> Unit,
    arabic: Boolean,
    onSpace: (CommunitySpace) -> Unit,
    onPost: (CommunityPost) -> Unit,
    onMember: (Member) -> Unit,
) {
    val results = remember(query, viewModel.spaces, viewModel.posts, viewModel.members) { buildSearchResults(viewModel, query.trim()) }
    val groups = SearchKind.entries.map { kind -> kind to results.filter { it.kind == kind }.take(6) }.filter { it.second.isNotEmpty() }
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 7.dp).heightIn(max = 520.dp),
        colors = CardDefaults.cardColors(containerColor = Paper),
        shape = RoundedCornerShape(20.dp),
        border = BorderStroke(1.dp, Line),
        elevation = CardDefaults.cardElevation(defaultElevation = 18.dp),
    ) {
        LazyColumn(contentPadding = PaddingValues(vertical = 8.dp)) {
            item {
                Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp)) {
                    OutlinedTextField(
                        value = query,
                        onValueChange = onQuery,
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        leadingIcon = { Icon(Icons.Default.Search, null) },
                        placeholder = { Text(tr(arabic, "Search posts, spaces, or members", "ابحث في المنشورات أو المساحات أو الأعضاء"), maxLines = 1, overflow = TextOverflow.Ellipsis) },
                        shape = RoundedCornerShape(16.dp),
                    )
                    Row(Modifier.fillMaxWidth().padding(horizontal = 3.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(tr(arabic, if (query.isBlank()) "Discover community" else "Search results", if (query.isBlank()) "اكتشف المجتمع" else "نتائج البحث"), Modifier.weight(1f), color = Burgundy, fontWeight = FontWeight.Bold)
                        Text("${results.size} ${tr(arabic, if (results.size == 1) "match" else "matches", "نتيجة")}", color = Muted, fontSize = 10.sp)
                    }
                }
            }
            if (groups.isEmpty()) item {
                Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(tr(arabic, "No community results", "لا توجد نتائج في المجتمع"), fontWeight = FontWeight.Bold)
                    Text(tr(arabic, "Try a post title, a/space-handle, or @username.", "جرّب عنوان منشور أو a/معرّف-مساحة أو @اسم-مستخدم."), Modifier.padding(top = 5.dp), color = Muted, fontSize = 12.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                }
            }
            groups.forEach { (kind, groupItems) ->
                item {
                    val label = when (kind) { SearchKind.SPACE -> tr(arabic, "Spaces", "المساحات"); SearchKind.POST -> tr(arabic, "Posts", "المنشورات"); SearchKind.MEMBER -> tr(arabic, "Members", "الأعضاء") }
                    Text(label.uppercase(), Modifier.fillMaxWidth().background(SearchSurface.copy(alpha = .6f)).padding(horizontal = 15.dp, vertical = 7.dp), color = Muted, fontSize = 9.sp, fontWeight = FontWeight.Black, letterSpacing = 1.sp)
                }
                items(groupItems, key = { "${it.kind}-${it.id}" }) { result ->
                    Row(
                        Modifier.fillMaxWidth().clickable {
                            result.space?.let(onSpace)
                            result.post?.let(onPost)
                            result.member?.let(onMember)
                        }.padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        when {
                            result.member != null -> Avatar(result.member.displayName, result.member.photoBase64, result.member.photoUrl, 42, result.member.verified)
                            else -> Surface(Modifier.size(42.dp), color = if (result.kind == SearchKind.SPACE) Burgundy else SandLight, shape = RoundedCornerShape(12.dp)) { Box(contentAlignment = Alignment.Center) { Text(if (result.kind == SearchKind.SPACE) result.space?.symbol.orEmpty().ifBlank { initials(result.title) } else if (result.post?.type == "question") "?" else if (result.post?.type == "behance") "P" else "T", color = if (result.kind == SearchKind.SPACE) Gold else Burgundy, fontWeight = FontWeight.Bold) } }
                        }
                        Column(Modifier.padding(horizontal = 11.dp).weight(1f)) {
                            Text(result.title, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(result.subtitle, color = Muted, fontSize = 10.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                        Text(when (result.kind) { SearchKind.SPACE -> tr(arabic, "Space", "مساحة"); SearchKind.POST -> tr(arabic, "Post", "منشور"); SearchKind.MEMBER -> tr(arabic, "Profile", "ملف") }, color = Burgundy, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                    }
                    HorizontalDivider(color = Line.copy(alpha = .65f))
                }
            }
        }
    }
}

@Composable
private fun CommunityNavigation(
    selected: CommunityScreen,
    arabic: Boolean,
    profile: Member?,
    onProfileLongPress: () -> Unit,
    onSelected: (CommunityScreen) -> Unit,
) {
    Box(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 14.dp, vertical = 6.dp)) {
        Surface(
            modifier = Modifier.fillMaxWidth().height(62.dp),
            shape = RoundedCornerShape(28.dp),
            color = Paper.copy(alpha = 0.98f),
            border = BorderStroke(1.dp, Line.copy(alpha = 0.8f)),
            shadowElevation = 10.dp,
        ) {
            Row(Modifier.fillMaxSize().padding(horizontal = 6.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                NavItem(selected == CommunityScreen.HOME, Icons.Default.Home, tr(arabic, "Home", "الرئيسية")) { onSelected(CommunityScreen.HOME) }
                NavItem(selected == CommunityScreen.SPACES, Icons.Default.Tag, tr(arabic, "Spaces", "المساحات")) { onSelected(CommunityScreen.SPACES) }
                NavItem(selected == CommunityScreen.CREATE, Icons.Default.Add, tr(arabic, "Create", "إنشاء"), primary = true) { onSelected(CommunityScreen.CREATE) }
                NavItem(selected == CommunityScreen.CHAT_INBOX || selected == CommunityScreen.MESSAGES, Icons.Default.ChatBubbleOutline, tr(arabic, "Messages", "الرسائل")) { onSelected(CommunityScreen.CHAT_INBOX) }
                NavItem(selected == CommunityScreen.PROFILE || selected == CommunityScreen.SETTINGS || selected == CommunityScreen.CONNECTIONS || selected == CommunityScreen.ARCHIVED, Icons.Default.PersonOutline, tr(arabic, "Profile", "الملف"), profile = profile, onLongPress = onProfileLongPress) { onSelected(CommunityScreen.PROFILE) }
            }
        }
    }
}

@Composable
private fun RowScope.NavItem(selected: Boolean, icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, primary: Boolean = false, profile: Member? = null, onLongPress: (() -> Unit)? = null, action: () -> Unit) {
    val background = when { primary && selected -> BurgundyDark; primary -> Burgundy; selected -> SandLight; else -> Color.Transparent }
    val foreground = if (primary) Color.White else if (selected) Burgundy else Color(0xFF817577)
    Column(
        modifier = Modifier.weight(1f).height(52.dp).padding(horizontal = 2.dp).clip(RoundedCornerShape(if (primary) 22.dp else 18.dp)).background(background).combinedClickable(onClick = action, onLongClick = onLongPress).semantics { contentDescription = label },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        if (profile != null) Avatar(profile.displayName, profile.photoBase64, profile.photoUrl, 22, profile.verified) else Icon(icon, null, tint = foreground, modifier = Modifier.size(21.dp))
        Text(label, fontSize = 9.sp, fontWeight = FontWeight.Bold, color = foreground, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun HomeScreen(viewModel: CommunityViewModel, arabic: Boolean, onComments: (CommunityPost) -> Unit, onMember: (Member) -> Unit) {
    val posts = viewModel.visiblePosts
    var disconnectingSpace by remember { mutableStateOf<CommunitySpace?>(null) }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 22.dp),
    ) {
        item {
            if (!viewModel.firebaseConfigured) FirebaseSetupBanner(arabic)
            if (viewModel.selectedSpace != null) {
                val space = viewModel.spaces.firstOrNull { it.slug == viewModel.selectedSpace }
                val owned = space?.creatorId == viewModel.currentUser?.uid
                val connected = space?.slug in viewModel.connectedSpaces
                val pending = !connected && space?.slug?.let { viewModel.spaceRequestStatuses[it] } == "pending"
                AreaHeader(space, connected, owned, viewModel.canManageSpace(space?.slug.orEmpty()), pending, space?.slug?.let(viewModel.spaceAccessBySlug::get), arabic, onBack = { viewModel.selectedSpace = null }, onMessages = {
                    if (space != null) viewModel.openSpaceMessages(space)
                }) {
                    if (viewModel.currentUser == null) viewModel.showMessage(tr(arabic, "Sign in to connect with spaces.", "سجّل الدخول للتواصل مع المساحات."))
                    else if (space != null && connected) disconnectingSpace = space
                    else if (space != null && !pending) viewModel.connectSpace(space)
                }
                if (space != null && !viewModel.canAccessSpace(space)) PrivateSpaceGate(space, pending, arabic)
                if (space?.isViewOnly == true && !connected && !owned) Surface(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 5.dp), color = SandLight, shape = RoundedCornerShape(16.dp), border = BorderStroke(1.dp, Gold)) {
                    Text(tr(arabic, "View-only access: you can read posts, comment, and vote now. Request connection approval to post or request Messages access.", "وصول للعرض فقط: يمكنك الآن قراءة المنشورات والتعليق والتصويت. اطلب الموافقة على الاتصال للنشر أو طلب الوصول إلى الرسائل."), Modifier.padding(14.dp), color = Burgundy, fontSize = 11.sp, lineHeight = 17.sp)
                }
            }
            FeedControls(viewModel, arabic, posts.size)
        }
        if (posts.isEmpty()) {
            item { EmptyFeed(false, arabic) }
        } else {
            items(posts, key = { it.id }) { post ->
                PostCard(
                    post = post,
                    space = viewModel.spaces.firstOrNull { it.slug == post.communitySlug },
                    member = viewModel.members[post.userId],
                    members = viewModel.members,
                    arabic = arabic,
                    onVote = { viewModel.vote(post, it) },
                    signedIn = viewModel.currentUser != null,
                    onComments = { onComments(post) },
                    onMember = { member -> member?.let(onMember) },
                    onSpace = { slug -> viewModel.selectedSpace = slug },
                    canModerate = viewModel.canManageSpace(post.communitySlug),
                    onModerate = { action, reason -> viewModel.moderateSpacePost(post, action, reason) {} },
                    showSpaceSource = viewModel.selectedSpace == null,
                    chatSpaces = viewModel.chatSpaces,
                    onShareToChat = { viewModel.sharePostToChat(post, it) },
                )
            }
        }
    }
    disconnectingSpace?.let { space ->
        DisconnectSpaceDialog(space, arabic, onDismiss = { disconnectingSpace = null }) {
            disconnectingSpace = null
            viewModel.disconnectSpace(space)
        }
    }
}

@Composable
private fun ChatInboxScreen(viewModel: CommunityViewModel, arabic: Boolean) {
    var search by remember { mutableStateOf("") }
    val spaces = viewModel.chatSpaces.filter { search.isBlank() || it.name.contains(search, true) || it.slug.contains(search, true) }
        .sortedByDescending { viewModel.chatLatestMessages[it.slug]?.createdAt?.seconds ?: 0L }
    LaunchedEffect(viewModel.chatSpaces.map { it.slug }) { viewModel.refreshChatInbox() }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(12.dp, 18.dp, 12.dp, 28.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Column(Modifier.padding(horizontal = 4.dp, vertical = 8.dp)) {
                Text(tr(arabic, "YOUR SPACE CHATS", "دردشات مساحاتك"), color = Burgundy, fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 1.4.sp)
                Text(tr(arabic, "Messages", "الرسائل"), Modifier.padding(top = 4.dp), fontFamily = MaterialTheme.typography.titleLarge.fontFamily, fontWeight = FontWeight.ExtraBold, fontSize = 29.sp)
                Text(tr(arabic, "Open a conversation from the spaces you are connected to.", "افتح محادثة من المساحات التي تتصل بها."), Modifier.padding(top = 5.dp), color = Muted, fontSize = 12.sp)
            }
        }
        if (viewModel.currentUser != null) item {
            OutlinedTextField(search, { search = it.take(80) }, Modifier.fillMaxWidth(), singleLine = true, placeholder = { Text(tr(arabic, "Search Messages", "البحث في الرسائل"), color = Muted) }, leadingIcon = { Text("⌕", color = Muted) }, shape = RoundedCornerShape(14.dp))
        }
        when {
            viewModel.currentUser == null -> item { EmptyState("◯", tr(arabic, "Sign in for Messages", "سجّل الدخول للرسائل"), tr(arabic, "Your connected space chats will appear here after you sign in.", "ستظهر دردشات المساحات المتصل بها هنا بعد تسجيل الدخول.")) }
            spaces.isEmpty() -> item { EmptyState("◯", tr(arabic, "No space chats yet", "لا توجد دردشات مساحات بعد"), tr(arabic, "Connect to a space with Messages enabled to see it here.", "اتصل بمساحة مفعّلة فيها الرسائل لتظهر هنا.")) }
            else -> items(spaces, key = { it.slug }) { space ->
                val latest = viewModel.chatLatestMessages[space.slug]
                val banned = viewModel.spaceAccessBySlug[space.slug]?.chatBanned == true
                val active = !banned && latest != null && latest.senderId != viewModel.currentUser?.uid
                Surface(
                    onClick = { viewModel.openSpaceMessages(space) },
                    modifier = Modifier.fillMaxWidth(),
                    color = if (banned) Color(0xFFFFEEEC) else Color.Transparent,
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Row(Modifier.padding(horizontal = 5.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                        Avatar(space.name, space.imageBase64, "", 62)
                        Column(Modifier.padding(horizontal = 12.dp).weight(1f)) {
                            Text(space.name, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (banned) Text(
                                tr(arabic, "Banned from this space's Messages · Tap to request access", "محظور من رسائل هذه المساحة · اضغط لطلب الوصول"),
                                Modifier.padding(top = 4.dp), color = Color(0xFFB3261E), fontWeight = FontWeight.Bold, fontSize = 11.sp, maxLines = 2, overflow = TextOverflow.Ellipsis,
                            ) else Text(
                                latest?.let { (if (it.senderId == viewModel.currentUser?.uid) tr(arabic, "You: ", "أنت: ") else "") + it.text.ifBlank { if (it.audioPath.isNotBlank()) tr(arabic, "Voice message", "رسالة صوتية") else if (it.imagePath.isNotBlank()) tr(arabic, "Photo", "صورة") else tr(arabic, "Shared post", "منشور مُشارك") } } ?: tr(arabic, "Start the conversation", "ابدأ المحادثة"),
                                Modifier.padding(top = 4.dp), color = if (active) Ink else Muted, fontWeight = if (active) FontWeight.Bold else FontWeight.Normal, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            )
                        }
                        if (latest != null) Text(relativeTime(latest.createdAt, arabic), color = Muted, fontSize = 9.sp)
                        if (active) Box(Modifier.padding(start = 7.dp).size(9.dp).background(Color(0xFF3483D5), CircleShape))
                    }
                }
            }
        }
    }
}

@Composable
private fun SpaceMessagesScreen(viewModel: CommunityViewModel, arabic: Boolean, onMember: (Member) -> Unit, onPost: (CommunityPost) -> Unit) {
    val space = viewModel.spaces.firstOrNull { it.slug == viewModel.selectedSpace }
    val listState = rememberLazyListState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var text by remember(space?.slug) { mutableStateOf("") }
    var imageDataUrl by remember(space?.slug) { mutableStateOf("") }
    var preparingImage by remember(space?.slug) { mutableStateOf(false) }
    var sending by remember(space?.slug) { mutableStateOf(false) }
    var uploadProgress by remember(space?.slug) { mutableStateOf(0) }
    var reply by remember(space?.slug) { mutableStateOf<SpaceMessage?>(null) }
    var enableConfirm by remember { mutableStateOf(false) }
    var editTarget by remember { mutableStateOf<SpaceMessage?>(null) }
    var editText by remember { mutableStateOf("") }
    var deleteTarget by remember { mutableStateOf<SpaceMessage?>(null) }
    var seenDialogMembers by remember { mutableStateOf<List<Member>>(emptyList()) }
    var onlineDialogMembers by remember { mutableStateOf<List<Member>>(emptyList()) }
    var reactionTarget by remember { mutableStateOf<SpaceMessage?>(null) }
    var reactionPickerMine by remember { mutableStateOf("") }
    var reactionDetails by remember { mutableStateOf<List<SpaceMessageReaction>>(emptyList()) }
    var reactionDetailsEmoji by remember { mutableStateOf("") }
    var pendingMessages by remember(space?.slug) { mutableStateOf<List<PendingSpaceMessage>>(emptyList()) }
    var hasMovedFromChatTop by remember(space?.slug) { mutableStateOf(false) }
    var voiceRecorder by remember { mutableStateOf<MediaRecorder?>(null) }
    var voiceFile by remember(space?.slug) { mutableStateOf<File?>(null) }
    var voiceStartedAt by remember { mutableStateOf(0L) }
    var voiceDurationMs by remember { mutableStateOf(0L) }
    var recordingVoice by remember { mutableStateOf(false) }
    fun openReactionPicker(message: SpaceMessage) {
        viewModel.loadSpaceMessageReactions(space ?: return, message.id) { reactions ->
            reactionPickerMine = reactions.firstOrNull { it.userId == viewModel.currentUser?.uid }?.emoji.orEmpty()
            reactionTarget = message
        }
    }
    fun quickLove(message: SpaceMessage) {
        viewModel.loadSpaceMessageReactions(space ?: return, message.id) { reactions ->
            if (reactions.none { it.userId == viewModel.currentUser?.uid && it.emoji == "❤️" }) {
                viewModel.reactToSpaceMessage(space, message.id, "❤️")
            }
        }
    }
    fun stopVoiceRecording(keep: Boolean = true) {
        val recorder = voiceRecorder
        voiceRecorder = null
        runCatching { recorder?.stop() }
        runCatching { recorder?.release() }
        recordingVoice = false
        voiceDurationMs = (System.currentTimeMillis() - voiceStartedAt).coerceIn(0L, 5 * 60 * 1000L)
        if (!keep || voiceDurationMs < 250) { voiceFile?.delete(); voiceFile = null; voiceDurationMs = 0 }
    }
    fun startVoiceRecording() {
        runCatching {
            voiceFile?.delete()
            val file = File.createTempFile("voice-message-", ".m4a", context.cacheDir)
            val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(context) else @Suppress("DEPRECATION") MediaRecorder()
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            recorder.setAudioEncodingBitRate(96_000)
            recorder.setAudioSamplingRate(44_100)
            recorder.setMaxDuration(5 * 60 * 1000)
            recorder.setOutputFile(file.absolutePath)
            recorder.setOnInfoListener { _, what, _ -> if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED) stopVoiceRecording() }
            recorder.prepare()
            recorder.start()
            voiceFile = file
            voiceRecorder = recorder
            voiceStartedAt = System.currentTimeMillis()
            voiceDurationMs = 0
            recordingVoice = true
            imageDataUrl = ""
        }.onFailure { viewModel.showMessage(it.localizedMessage ?: tr(arabic, "Voice recording could not start.", "تعذر بدء التسجيل الصوتي.")) }
    }
    val recordPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> if (granted) startVoiceRecording() else viewModel.showMessage(tr(arabic, "Microphone permission is required for voice messages.", "يلزم إذن الميكروفون للرسائل الصوتية.")) }
    DisposableEffect(space?.slug) { onDispose { stopVoiceRecording(false); voiceFile?.delete() } }
    val imageLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) scope.launch {
            preparingImage = true
            runCatching { preparePostImage(context, uri) }
                .onSuccess { imageDataUrl = it }
                .onFailure { viewModel.showMessage(it.localizedMessage ?: tr(arabic, "Image could not be prepared.", "تعذر تجهيز الصورة.")) }
            preparingImage = false
        }
    }
    val initialLastReadId = remember(space?.slug) { viewModel.spaceMessageReads.firstOrNull { it.userId == viewModel.currentUser?.uid }?.lastMessageId.orEmpty() }
    val firstUnreadIndex = remember(viewModel.spaceMessages, initialLastReadId) {
        if (initialLastReadId.isBlank()) -1
        else {
            val lastReadIdx = viewModel.spaceMessages.indexOfFirst { it.id == initialLastReadId }
            if (lastReadIdx in 0 until viewModel.spaceMessages.lastIndex) lastReadIdx + 1
            else if (lastReadIdx == -1 && viewModel.spaceMessages.isNotEmpty()) 0
            else -1
        }
    }
    var initialScrolled by remember(space?.slug) { mutableStateOf(false) }
    LaunchedEffect(viewModel.spaceMessages.size, space?.slug) {
        if (viewModel.spaceMessages.isNotEmpty()) {
            if (!initialScrolled) {
                initialScrolled = true
                val targetIndex = if (firstUnreadIndex >= 0) firstUnreadIndex else viewModel.spaceMessages.lastIndex
                listState.scrollToItem((targetIndex + (if (firstUnreadIndex >= 0) 1 else 0)).coerceIn(0, viewModel.spaceMessages.lastIndex + 1))
            } else {
                listState.animateScrollToItem(viewModel.spaceMessages.lastIndex + (if (firstUnreadIndex >= 0) 1 else 0))
            }
            viewModel.markSpaceMessagesSeen(space ?: return@LaunchedEffect, viewModel.spaceMessages.last().id)
        }
    }
    LaunchedEffect(listState.firstVisibleItemIndex, viewModel.spaceMessages.size) {
        if (listState.firstVisibleItemIndex > 0) hasMovedFromChatTop = true
        else if (hasMovedFromChatTop && viewModel.spaceMessages.isNotEmpty()) viewModel.loadOlderSpaceMessages(space ?: return@LaunchedEffect)
    }
    if (space == null) return EmptyState("◯", tr(arabic, "Space unavailable", "المساحة غير متاحة"), tr(arabic, "Return to Spaces and try again.", "ارجع إلى المساحات وحاول مجدداً."))
    val onlineMembers = viewModel.spaceChatPresence
        .filter { presence -> presence.activeAt?.toDate()?.let { System.currentTimeMillis() - it.time < 90_000 } == true }
        .mapNotNull { presence -> viewModel.members[presence.userId] }
    val mentionMatch = Regex("(^|[^A-Za-z0-9_.+\\-])@([A-Za-z0-9_]*)$").find(text)
    val mentionQuery = mentionMatch?.groupValues?.getOrNull(2).orEmpty().lowercase()
    val mentionMembers = if (mentionMatch == null) emptyList() else viewModel.spaceChatMemberIds
        .mapNotNull(viewModel.members::get)
        .filter { it.username.isNotBlank() && (mentionQuery.isBlank() || it.username.lowercase().contains(mentionQuery) || it.displayName.lowercase().contains(mentionQuery)) }
        .sortedWith(compareBy<Member> { !it.username.lowercase().startsWith(mentionQuery) }.thenBy { it.displayName.lowercase() })
        .take(6)
    Column(Modifier.fillMaxSize().background(Cream)) {
        Surface(color = Paper, border = BorderStroke(1.dp, Line)) {
            Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("←", Modifier.size(42.dp).clip(CircleShape).clickable { viewModel.returnFromSpaceMessages() }.padding(10.dp), color = Burgundy, fontSize = 20.sp)
                Avatar(space.name, space.imageBase64, "", 44)
                Column(Modifier.padding(horizontal = 10.dp).weight(1f)) {
                    Text(space.name, fontWeight = FontWeight.ExtraBold, fontSize = 17.sp)
                    Text("a/${space.slug} · ${tr(arabic, "Connected members", "الأعضاء المتصلون")}", color = Muted, fontSize = 10.sp)
                }
                if (onlineMembers.isNotEmpty()) Row(
                    Modifier.clip(RoundedCornerShape(18.dp)).clickable { onlineDialogMembers = onlineMembers }.padding(horizontal = 4.dp, vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row {
                        onlineMembers.take(3).forEachIndexed { index, member ->
                            Box(Modifier.offset(x = (-index * 8).dp)) { Avatar(member.displayName, member.photoBase64, member.photoUrl, 25, member.verified) }
                        }
                    }
                    if (onlineMembers.size > 3) Text("+${onlineMembers.size - 3}", color = Burgundy, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold)
                    Text("●", Modifier.padding(start = 4.dp), color = Color(0xFF49AF74), fontSize = 10.sp)
                }
            }
        }
        if (!space.chatEnabled) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(Modifier.padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("◯", color = Burgundy, fontSize = 48.sp)
                    Text(tr(arabic, "Add Messages", "إضافة الرسائل"), Modifier.padding(top = 10.dp), fontWeight = FontWeight.ExtraBold, fontSize = 22.sp)
                    Text(tr(arabic, "A Messages channel is permanent. It cannot be disabled or deleted after activation.", "قناة الرسائل دائمة. لا يمكن تعطيلها أو حذفها بعد التفعيل."), Modifier.padding(top = 7.dp), color = Muted, fontSize = 13.sp, lineHeight = 20.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                    if (viewModel.canManageSpace(space.slug)) Button(onClick = { enableConfirm = true }, Modifier.padding(top = 16.dp), colors = ButtonDefaults.buttonColors(containerColor = Burgundy)) { Text(tr(arabic, "Enable Messages", "تفعيل الرسائل")) }
                    else Text(tr(arabic, "A space administrator must enable Messages.", "يجب أن يفعّل أحد مشرفي المساحة الرسائل."), Modifier.padding(top = 14.dp), color = Clay, fontSize = 12.sp)
                }
            }
        } else if (!viewModel.canAccessSpaceMessages(space)) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(Modifier.padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("◯", color = Burgundy, fontSize = 42.sp)
                    val banned = viewModel.activeSpaceAccessLoaded && viewModel.activeSpaceAccess.chatBanned
                    Text(tr(arabic, if (banned) "Messages access removed" else "Messages approval required", if (banned) "تمت إزالة وصول الرسائل" else "مطلوب تصريح الرسائل"), Modifier.padding(top = 10.dp), fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
                    Text(tr(arabic, if (banned) "You are banned from this space’s Messages. Ask an administrator to restore access." else "New connected members need approval from a space administrator before viewing or sending Messages.", if (banned) "أنت محظور من رسائل هذه المساحة. اطلب من المشرف استعادة الوصول." else "يحتاج الأعضاء المتصلون الجدد إلى موافقة مشرف المساحة قبل عرض الرسائل أو إرسالها."), Modifier.padding(top = 7.dp), color = if (banned) Color(0xFFB3261E) else Muted, fontSize = 12.sp, lineHeight = 18.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                    if (space.slug in viewModel.connectedSpaces) Button(onClick = { viewModel.requestSpaceChatAccess(space) }, Modifier.padding(top = 15.dp), enabled = !viewModel.activeSpaceChatRequestPending, colors = ButtonDefaults.buttonColors(containerColor = Burgundy)) { Text(tr(arabic, if (viewModel.activeSpaceChatRequestPending) "Request pending" else "Request Messages access", if (viewModel.activeSpaceChatRequestPending) "الطلب قيد المراجعة" else "طلب الوصول إلى الرسائل")) }
                }
            }
        } else {
            LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = listState, contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                if (viewModel.spaceMessagesLoadingOlder) item("older-message-loader") { Box(Modifier.fillMaxWidth().padding(8.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(Modifier.size(22.dp), color = Burgundy, strokeWidth = 2.dp) } }
                if (viewModel.spaceMessages.isEmpty()) item { EmptyState("◯", tr(arabic, "Start the conversation", "ابدأ المحادثة"), tr(arabic, "Messages update instantly for connected members.", "تتحدث الرسائل فوراً للأعضاء المتصلين.")) }
                itemsIndexed(viewModel.spaceMessages, key = { _, message -> message.id }) { index, message ->
                    if (index == firstUnreadIndex) {
                        Box(Modifier.fillMaxWidth().padding(vertical = 10.dp), contentAlignment = Alignment.Center) {
                            HorizontalDivider(Modifier.fillMaxWidth(), color = Burgundy.copy(alpha = 0.25f), thickness = 1.dp)
                            Surface(shape = CircleShape, color = Burgundy, shadowElevation = 2.dp) {
                                Text(tr(arabic, "New Messages", "رسائل جديدة"), Modifier.padding(horizontal = 14.dp, vertical = 4.dp), color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
                            }
                        }
                    }
                    val member = viewModel.members[message.senderId]
                    val sharedPost = viewModel.posts.firstOrNull { it.id == message.sharedPostId }
                    val mine = message.senderId == viewModel.currentUser?.uid
                    val seenMembers = viewModel.spaceMessageReads.filter { it.lastMessageId == message.id && it.userId != viewModel.currentUser?.uid }.mapNotNull { viewModel.members[it.userId] }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start, verticalAlignment = Alignment.Top) {
                        if (!mine) Box(Modifier.clickable { member?.let(onMember) }) { Avatar(member?.displayName ?: message.senderName, member?.photoBase64.orEmpty(), member?.photoUrl.orEmpty(), 34, member?.verified == true) }
                        Column(horizontalAlignment = if (mine) Alignment.End else Alignment.Start) {
                        Surface(
                            modifier = Modifier.padding(horizontal = 7.dp).fillMaxWidth(.82f).then(
                                if (message.deleted) Modifier else Modifier.combinedClickable(
                                    onClick = {},
                                    onDoubleClick = { quickLove(message) },
                                    onLongClick = { openReactionPicker(message) },
                                )
                            ),
                            color = if (mine) Color(0xFFF3E4DF) else Paper,
                            shape = RoundedCornerShape(if (mine) 17.dp else 6.dp, if (mine) 6.dp else 17.dp, 17.dp, 17.dp),
                            border = BorderStroke(1.dp, Line),
                        ) {
                            Column(Modifier.padding(11.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(member?.displayName ?: message.senderName, Modifier.clickable { member?.let(onMember) }, color = Burgundy, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
                                    Spacer(Modifier.weight(1f))
                                    Text(relativeTime(message.createdAt, arabic), color = Muted, fontSize = 9.sp)
                                }
                                if (message.deleted) Text(tr(arabic, "Message deleted", "تم حذف الرسالة"), Modifier.padding(top = 7.dp), color = Muted, fontSize = 12.sp, fontStyle = androidx.compose.ui.text.font.FontStyle.Italic)
                                if (!message.deleted && message.replyToId.isNotBlank()) Surface(Modifier.fillMaxWidth().padding(top = 6.dp), color = Burgundy.copy(alpha = .05f), shape = RoundedCornerShape(8.dp)) {
                                    Column(Modifier.padding(8.dp)) { Text(message.replyToSenderName, color = Burgundy, fontSize = 10.sp, fontWeight = FontWeight.Bold); Text(message.replyToText, color = Muted, fontSize = 10.sp, maxLines = 2, overflow = TextOverflow.Ellipsis) }
                                }
                                if (!message.deleted && message.text.isNotBlank()) {
                                    MentionText(message.text, Modifier.padding(top = 7.dp), style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp, lineHeight = 21.sp), onUser = { username -> viewModel.members.values.firstOrNull { it.username.equals(username, true) }?.let(onMember) }, onSpace = { slug -> viewModel.selectedSpace = slug; viewModel.screen = CommunityScreen.HOME })
                                    if (message.editedAt != null) Text(tr(arabic, "Edited", "تم التعديل"), color = Clay, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                                }
                                if (!message.deleted && message.imagePath.isNotBlank()) FirebaseStorageImage(
                                    path = message.imagePath,
                                    modifier = Modifier.fillMaxWidth().heightIn(min = 150.dp, max = 430.dp).padding(top = 8.dp).clip(RoundedCornerShape(12.dp)),
                                    description = tr(arabic, "Chat photo", "صورة الدردشة"),
                                )
                                if (!message.deleted && message.audioPath.isNotBlank()) VoiceMessagePlayer(message.audioPath, message.audioDurationMs, arabic)
                                if (!message.deleted && message.sharedPostId.isNotBlank()) {
                                    val allowed = sharedPost != null && viewModel.canViewPost(sharedPost)
                                    Surface(onClick = { if (allowed) onPost(sharedPost!!) }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp), color = if (allowed) SandLight else SearchSurface, shape = RoundedCornerShape(12.dp), border = BorderStroke(1.dp, Line), enabled = allowed) {
                                        Column(Modifier.padding(12.dp)) {
                                            if (allowed && sharedPost.imageDataUrls.isNotEmpty()) FirebaseImage(sharedPost.imageDataUrls.first(), "", Modifier.fillMaxWidth().height(145.dp).clip(RoundedCornerShape(9.dp)), ContentScale.Crop, sharedPost.title)
                                            Text(if (allowed) tr(arabic, "SHARED POST", "منشور مشارك") else tr(arabic, "RESTRICTED POST", "منشور مقيّد"), color = Clay, fontSize = 9.sp, fontWeight = FontWeight.Black)
                                            Text(if (allowed) sharedPost!!.title else tr(arabic, "Connect to the private space to view this post.", "اتصل بالمساحة الخاصة لعرض هذا المنشور."), Modifier.padding(top = 4.dp), fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                            if (allowed) Text("a/${sharedPost!!.communitySlug}  →", Modifier.padding(top = 5.dp), color = Burgundy, fontSize = 10.sp)
                                        }
                                    }
                                }
                                if (!message.deleted && message.reactionCounts.isNotEmpty()) Row(Modifier.padding(top = 7.dp).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                                    message.reactionCounts.filterValues { it > 0 }.forEach { (emoji, count) ->
                                        Surface(onClick = { viewModel.loadSpaceMessageReactions(space, message.id) { reactionDetails = it; reactionDetailsEmoji = emoji } }, shape = RoundedCornerShape(50), color = Color.White, border = BorderStroke(1.dp, Line)) {
                                            Text("$emoji $count", Modifier.padding(horizontal = 8.dp, vertical = 4.dp), fontSize = 11.sp)
                                        }
                                    }
                                }
                                Row(Modifier.padding(top = 5.dp)) {
                                    if (!message.deleted) TextButton(onClick = { openReactionPicker(message) }) { Text("☺ ${tr(arabic, "React", "تفاعل")}", fontSize = 10.sp) }
                                    if (!message.deleted) TextButton(onClick = { reply = message }) { Text(tr(arabic, "Reply", "رد"), fontSize = 10.sp) }
                                    if (mine && !message.deleted) TextButton(onClick = { editTarget = message; editText = message.text }) { Text(tr(arabic, "Edit", "تعديل"), fontSize = 10.sp) }
                                    if ((mine || viewModel.canManageSpace(space.slug)) && !message.deleted) TextButton(onClick = { deleteTarget = message }) { Text(tr(arabic, "Delete", "حذف"), color = Color(0xFFA12D35), fontSize = 10.sp) }
                                }
                            }
                        }
                        if (seenMembers.isNotEmpty()) Row(Modifier.padding(top = 3.dp, end = 7.dp).clickable { seenDialogMembers = seenMembers }) {
                            seenMembers.take(2).forEach { seen -> Box(Modifier.padding(start = if (seenMembers.indexOf(seen) == 0) 0.dp else 0.dp)) { Avatar(seen.displayName, seen.photoBase64, seen.photoUrl, 20, seen.verified) } }
                            if (seenMembers.size > 2) Surface(color = Clay, shape = CircleShape, modifier = Modifier.size(20.dp)) { Box(contentAlignment = Alignment.Center) { Text("+${seenMembers.size - 2}", color = Color.White, fontSize = 7.sp, fontWeight = FontWeight.Bold) } }
                        }
                        }
                    }
                }
                items(pendingMessages, key = { it.id }) { pending ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        Surface(
                            modifier = Modifier.padding(horizontal = 7.dp).fillMaxWidth(.82f),
                            color = Color(0xFFF3E4DF),
                            shape = RoundedCornerShape(17.dp, 6.dp, 17.dp, 17.dp),
                            border = BorderStroke(1.dp, Line),
                        ) {
                            Column(Modifier.padding(11.dp)) {
                                Text(pending.text, fontSize = 13.sp)
                                if (pending.imageDataUrl.isNotBlank()) FirebaseImage(pending.imageDataUrl, "", Modifier.padding(top = 8.dp).fillMaxWidth().heightIn(max = 220.dp).clip(RoundedCornerShape(12.dp)), ContentScale.Crop, tr(arabic, "Sending photo", "جارٍ إرسال الصورة"))
                                if (pending.voiceDurationMs > 0) Text("● ${(pending.voiceDurationMs / 1000).coerceAtLeast(1)}s", Modifier.padding(top = 8.dp), color = Burgundy, fontSize = 12.sp)
                                Text("◌ ${pending.status}", Modifier.padding(top = 6.dp), color = Clay, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
            if (mentionMembers.isNotEmpty()) Surface(color = Paper, border = BorderStroke(1.dp, Line), shadowElevation = 7.dp) {
                LazyRow(Modifier.fillMaxWidth().padding(horizontal = 9.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    items(mentionMembers, key = { it.uid }) { member ->
                        Surface(onClick = {
                            val tokenStart = mentionMatch?.groups?.get(2)?.range?.first?.minus(1) ?: text.length
                            text = text.replaceRange(tokenStart.coerceAtLeast(0), text.length, "@${member.username} ")
                        }, shape = RoundedCornerShape(13.dp), color = SandLight, border = BorderStroke(1.dp, Line)) {
                            Row(Modifier.padding(horizontal = 9.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                                Avatar(member.displayName, member.photoBase64, member.photoUrl, 30, member.verified)
                                Column(Modifier.padding(start = 7.dp)) { Text(member.displayName, fontWeight = FontWeight.Bold, fontSize = 11.sp, maxLines = 1); Text("@${member.username}", color = Burgundy, fontSize = 9.sp) }
                            }
                        }
                    }
                }
            }
            reply?.let { source -> Surface(color = Paper, border = BorderStroke(1.dp, Line)) { Row(Modifier.fillMaxWidth().padding(9.dp), verticalAlignment = Alignment.CenterVertically) { Column(Modifier.weight(1f)) { Text(tr(arabic, "Replying to ${source.senderName}", "الرد على ${source.senderName}"), color = Burgundy, fontSize = 10.sp, fontWeight = FontWeight.Bold); Text(source.text.ifBlank { if (source.imagePath.isNotBlank()) tr(arabic, "Photo", "صورة") else if (source.audioPath.isNotBlank()) tr(arabic, "Voice message", "رسالة صوتية") else tr(arabic, "Shared post", "منشور مشارك") }, color = Muted, fontSize = 10.sp, maxLines = 1) }; TextButton(onClick = { reply = null }) { Text("×") } } } }
            if (imageDataUrl.isNotBlank()) Surface(color = Paper, border = BorderStroke(1.dp, Line)) {
                Row(Modifier.fillMaxWidth().padding(9.dp), verticalAlignment = Alignment.CenterVertically) {
                    FirebaseImage(imageDataUrl, "", Modifier.size(62.dp).clip(RoundedCornerShape(11.dp)), ContentScale.Crop, tr(arabic, "Selected photo", "الصورة المختارة"))
                    Column(Modifier.padding(horizontal = 10.dp).weight(1f)) {
                        Text(tr(arabic, "Photo ready", "الصورة جاهزة"), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        Text(if (sending) tr(arabic, "Uploading $uploadProgress%", "جارٍ الرفع $uploadProgress٪") else tr(arabic, "Send it with an optional message", "أرسلها مع رسالة اختيارية"), color = Muted, fontSize = 10.sp)
                    }
                    TextButton(onClick = { imageDataUrl = "" }, enabled = !sending) { Text("×") }
                }
            }
            if (voiceFile != null) Surface(color = Paper, border = BorderStroke(1.dp, Line)) {
                Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("●", color = if (recordingVoice) Color(0xFFB3261E) else Burgundy, fontSize = 18.sp)
                    Column(Modifier.padding(horizontal = 10.dp).weight(1f)) {
                        Text(tr(arabic, if (recordingVoice) "Recording voice message…" else "Voice message ready", if (recordingVoice) "جارٍ تسجيل رسالة صوتية…" else "الرسالة الصوتية جاهزة"), fontWeight = FontWeight.Bold, fontSize = 11.sp)
                        Text(if (recordingVoice) tr(arabic, "Tap stop when finished", "اضغط إيقاف عند الانتهاء") else "${(voiceDurationMs / 1000).coerceAtLeast(1)}s", color = Muted, fontSize = 10.sp)
                    }
                    TextButton(onClick = { stopVoiceRecording(false) }, enabled = !sending) { Text(tr(arabic, "Cancel", "إلغاء")) }
                }
            }
            Row(Modifier.fillMaxWidth().imePadding().padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.Bottom) {
                OutlinedButton(
                    onClick = { imageLauncher.launch("image/*") },
                    modifier = Modifier.size(46.dp),
                    enabled = !preparingImage && !sending,
                    contentPadding = PaddingValues(0.dp),
                    shape = CircleShape,
                    colors = ButtonDefaults.outlinedButtonColors(containerColor = SandLight)
                ) {
                    if (preparingImage) CircularProgressIndicator(Modifier.size(18.dp), color = Burgundy, strokeWidth = 2.dp)
                    else Text("▧", color = Burgundy, fontSize = 18.sp)
                }
                OutlinedButton(
                    onClick = {
                        if (recordingVoice) stopVoiceRecording()
                        else if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) startVoiceRecording()
                        else recordPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                    },
                    modifier = Modifier.padding(start = 5.dp).size(46.dp),
                    enabled = !sending,
                    contentPadding = PaddingValues(0.dp),
                    shape = CircleShape,
                    colors = ButtonDefaults.outlinedButtonColors(
                        containerColor = if (recordingVoice) Color(0xFFB3261E) else SandLight,
                        contentColor = if (recordingVoice) Color.White else Burgundy
                    )
                ) {
                    Text(if (recordingVoice) "■" else "●", fontSize = 15.sp)
                }
                OutlinedTextField(
                    value = text,
                    onValueChange = { if (it.length <= 2000) text = it },
                    modifier = Modifier.padding(start = 5.dp).weight(1f),
                    enabled = !sending,
                    placeholder = { Text(tr(arabic, "Message… Type @ to tag", "رسالة… استخدم @ للإشارة"), fontSize = 13.sp) },
                    maxLines = 5,
                    shape = RoundedCornerShape(24.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Burgundy,
                        unfocusedBorderColor = Line,
                        focusedContainerColor = Color.White,
                        unfocusedContainerColor = Paper
                    )
                )
                Button(
                    onClick = {
                        val value = text.trim()
                        val recorded = voiceFile
                        val currentImg = imageDataUrl
                        val currentReply = reply
                        if (value.isNotBlank() || currentImg.isNotBlank() || recorded != null) {
                            sending = true
                            uploadProgress = 0
                            val pendingId = "pending-${System.nanoTime()}"
                            pendingMessages = pendingMessages + PendingSpaceMessage(
                                pendingId, value, currentImg, if (recorded != null) voiceDurationMs else 0,
                                tr(arabic, if (recorded != null) "Uploading voice note…" else if (currentImg.isNotBlank()) "Uploading photo…" else "Sending…", if (recorded != null) "جارٍ رفع الرسالة الصوتية…" else if (currentImg.isNotBlank()) "جارٍ رفع الصورة…" else "جارٍ الإرسال…")
                            )
                            text = ""
                            imageDataUrl = ""
                            reply = null
                            if (recordingVoice) stopVoiceRecording()
                            voiceFile = null
                            voiceDurationMs = 0

                            fun updatePending(status: String) { pendingMessages = pendingMessages.map { if (it.id == pendingId) it.copy(status = status) else it } }
                            val complete: (Boolean) -> Unit = { success ->
                                sending = false
                                if (success) {
                                    updatePending(tr(arabic, "Sent", "تم الإرسال"))
                                    scope.launch { kotlinx.coroutines.delay(1200); pendingMessages = pendingMessages.filterNot { it.id == pendingId } }
                                    uploadProgress = 0
                                    recorded?.delete()
                                } else {
                                    updatePending(tr(arabic, "Could not send", "تعذر الإرسال"))
                                }
                            }
                            if (recorded != null) viewModel.sendSpaceVoiceMessage(space, value, currentReply, recorded.readBytes(), voiceDurationMs, { uploadProgress = it; updatePending(tr(arabic, "Uploading voice note $it%", "جارٍ رفع الرسالة الصوتية $it٪")) }, complete)
                            else viewModel.sendSpaceMessage(space, value, currentReply, currentImg, { uploadProgress = it; if (currentImg.isNotBlank()) updatePending(tr(arabic, "Uploading photo $it%", "جارٍ رفع الصورة $it٪")) }, complete)
                        }
                    },
                    modifier = Modifier.padding(start = 5.dp).height(46.dp),
                    shape = RoundedCornerShape(24.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Burgundy),
                    enabled = !sending && (text.isNotBlank() || imageDataUrl.isNotBlank() || voiceFile != null)
                ) {
                    if (sending) CircularProgressIndicator(Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
                    else Text("↑", fontWeight = FontWeight.ExtraBold, fontSize = 16.sp)
                }
            }
        }
    }
    if (enableConfirm) AlertDialog(onDismissRequest = { enableConfirm = false }, title = { Text(tr(arabic, "Enable permanent Messages?", "تفعيل الرسائل الدائمة؟")) }, text = { Text(tr(arabic, "This channel and its history cannot be removed later.", "لا يمكن إزالة هذه القناة أو سجلها لاحقاً.")) }, confirmButton = { Button(onClick = { enableConfirm = false; viewModel.enableSpaceMessages(space) {} }) { Text(tr(arabic, "Enable", "تفعيل")) } }, dismissButton = { TextButton(onClick = { enableConfirm = false }) { Text(tr(arabic, "Cancel", "إلغاء")) } })
    editTarget?.let { target -> AlertDialog(
        onDismissRequest = { editTarget = null; editText = "" },
        title = { Text(tr(arabic, "Edit message", "تعديل الرسالة")) },
        text = { OutlinedTextField(editText, { editText = it.take(2000) }, Modifier.fillMaxWidth(), minLines = 3, maxLines = 7) },
        confirmButton = { Button(onClick = { viewModel.editSpaceMessage(space, target.id, editText.trim()) { if (it) { editTarget = null; editText = "" } } }, enabled = editText.isNotBlank() || target.imagePath.isNotBlank() || target.audioPath.isNotBlank() || target.sharedPostId.isNotBlank()) { Text(tr(arabic, "Save", "حفظ")) } },
        dismissButton = { TextButton(onClick = { editTarget = null; editText = "" }) { Text(tr(arabic, "Cancel", "إلغاء")) } },
    ) }
    deleteTarget?.let { target -> AlertDialog(
        onDismissRequest = { deleteTarget = null },
        title = { Text(tr(arabic, "Delete message?", "حذف الرسالة؟")) },
        text = { Text(tr(arabic, "The message content will be removed for everyone.", "سيتم حذف محتوى الرسالة لدى الجميع.")) },
        confirmButton = { Button(onClick = { viewModel.deleteSpaceMessage(space, target.id) { if (it) deleteTarget = null } }, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFA12D35))) { Text(tr(arabic, "Delete", "حذف")) } },
        dismissButton = { TextButton(onClick = { deleteTarget = null }) { Text(tr(arabic, "Cancel", "إلغاء")) } },
    ) }
    if (seenDialogMembers.isNotEmpty()) AlertDialog(
        onDismissRequest = { seenDialogMembers = emptyList() },
        title = { Text(tr(arabic, "Seen by", "شاهده")) },
        text = { LazyColumn(Modifier.fillMaxWidth().heightIn(max = 430.dp)) { items(seenDialogMembers, key = { it.uid }) { seen -> Row(Modifier.fillMaxWidth().clickable { seenDialogMembers = emptyList(); onMember(seen) }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) { Avatar(seen.displayName, seen.photoBase64, seen.photoUrl, 38, seen.verified); Column(Modifier.padding(horizontal = 10.dp)) { Text(seen.displayName, fontWeight = FontWeight.Bold, fontSize = 13.sp); Text("@${seen.username}", color = Muted, fontSize = 10.sp) } } } } },
        confirmButton = { TextButton(onClick = { seenDialogMembers = emptyList() }) { Text(tr(arabic, "Close", "إغلاق")) } },
    )
    if (onlineDialogMembers.isNotEmpty()) AlertDialog(
        onDismissRequest = { onlineDialogMembers = emptyList() },
        title = { Text(tr(arabic, "Online members", "الأعضاء المتصلون")) },
        text = { LazyColumn(Modifier.fillMaxWidth().heightIn(max = 430.dp)) { items(onlineDialogMembers, key = { it.uid }) { online -> Row(Modifier.fillMaxWidth().clickable { onlineDialogMembers = emptyList(); onMember(online) }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) { Avatar(online.displayName, online.photoBase64, online.photoUrl, 38, online.verified); Column(Modifier.padding(horizontal = 10.dp)) { Text(online.displayName, fontWeight = FontWeight.Bold, fontSize = 13.sp); Text("● ${tr(arabic, "Online now", "متصل الآن")}", color = Color(0xFF49AF74), fontSize = 10.sp) } } } } },
        confirmButton = { TextButton(onClick = { onlineDialogMembers = emptyList() }) { Text(tr(arabic, "Close", "إغلاق")) } },
    )
    reactionTarget?.let { target -> AlertDialog(
        onDismissRequest = { reactionTarget = null },
        title = { Text(tr(arabic, "React to message", "تفاعل مع الرسالة"), fontWeight = FontWeight.ExtraBold) },
        text = {
            Column {
                Text(if (reactionPickerMine.isBlank()) tr(arabic, "Choose the feeling that fits", "اختر التفاعل المناسب") else tr(arabic, "Tap your selected emoji to remove it", "اضغط على رمزك المحدد لإزالته"), color = Muted, fontSize = 11.sp)
                Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                    listOf("❤️" to tr(arabic, "Love", "أحببته"), "😂" to tr(arabic, "Funny", "مضحك"), "😮" to tr(arabic, "Wow", "واو"), "😢" to tr(arabic, "Sad", "حزين"), "🔥" to tr(arabic, "Fire", "رائع"), "👏" to tr(arabic, "Clap", "تصفيق")).forEach { (emoji, label) ->
                        val selected = reactionPickerMine == emoji
                        Surface(
                            onClick = { viewModel.reactToSpaceMessage(space, target.id, emoji); reactionTarget = null; reactionPickerMine = if (selected) "" else emoji },
                            modifier = Modifier.size(width = 42.dp, height = 60.dp),
                            color = if (selected) Burgundy.copy(alpha = .12f) else SandLight,
                            border = BorderStroke(1.dp, if (selected) Burgundy else Line),
                            shape = RoundedCornerShape(15.dp),
                        ) { Column(Modifier.padding(vertical = 7.dp), horizontalAlignment = Alignment.CenterHorizontally) { Text(emoji, fontSize = 22.sp); Text(label, color = if (selected) Burgundy else Muted, fontSize = 7.sp, maxLines = 1) } }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = { reactionTarget = null }) { Text(tr(arabic, "Cancel", "إلغاء")) } },
    ) }
    if (reactionDetailsEmoji.isNotBlank()) AlertDialog(
        onDismissRequest = { reactionDetailsEmoji = ""; reactionDetails = emptyList() },
        title = { Text("$reactionDetailsEmoji ${tr(arabic, "Reactions", "التفاعلات")}", fontWeight = FontWeight.ExtraBold) },
        text = { LazyColumn(Modifier.fillMaxWidth().heightIn(max = 430.dp)) { items(reactionDetails.filter { it.emoji == reactionDetailsEmoji }.sortedByDescending { it.userId == viewModel.currentUser?.uid }, key = { it.userId }) { reaction -> val member = viewModel.members[reaction.userId]; val isMe = reaction.userId == viewModel.currentUser?.uid; Row(Modifier.fillMaxWidth().then(if (member != null) Modifier.clickable { reactionDetailsEmoji = ""; reactionDetails = emptyList(); onMember(member) } else Modifier).padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) { Avatar(member?.displayName ?: tr(arabic, "Member", "عضو"), member?.photoBase64.orEmpty(), member?.photoUrl.orEmpty(), 38, member?.verified == true); Column(Modifier.padding(horizontal = 10.dp).weight(1f)) { Text(if (isMe) tr(arabic, "You", "أنت") else member?.displayName ?: reaction.userId.take(8), fontWeight = FontWeight.Bold, fontSize = 13.sp); if (!member?.username.isNullOrBlank()) Text("@${member?.username}", color = Muted, fontSize = 10.sp) }; Text(reaction.emoji, fontSize = 22.sp) } } } },
        confirmButton = { TextButton(onClick = { reactionDetailsEmoji = ""; reactionDetails = emptyList() }) { Text(tr(arabic, "Close", "إغلاق")) } },
    )
}

@Composable
private fun SelectedProjectsScreen(viewModel: CommunityViewModel, arabic: Boolean, onComments: (CommunityPost) -> Unit, onMember: (Member) -> Unit) {
    val projects = viewModel.selectedProjects
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 24.dp),
    ) {
        item {
            Box(
                Modifier.fillMaxWidth().padding(10.dp).clip(RoundedCornerShape(24.dp))
                    .background(Brush.linearGradient(listOf(BurgundyDark, Burgundy, Clay)))
                    .padding(horizontal = 24.dp, vertical = 30.dp),
            ) {
                Text("◇", Modifier.align(Alignment.BottomEnd).offset(x = 12.dp, y = 24.dp), color = Gold.copy(alpha = .12f), fontSize = 112.sp)
                Column(Modifier.fillMaxWidth(.88f)) {
                    Text(tr(arabic, "CURATED BY AIAS BASRA", "باختيار AIAS البصرة"), color = Gold, fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 1.3.sp)
                    Text(tr(arabic, "Selected projects", "المشاريع المختارة"), Modifier.padding(top = 7.dp), color = Color.White, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.ExtraBold)
                    Text(tr(arabic, "Member projects chosen for craft, clarity, experimentation, and the conversations they inspire.", "مشاريع الأعضاء المختارة لجودة تنفيذها ووضوحها وتجريبها والحوارات التي تلهمها."), Modifier.padding(top = 8.dp), color = Color.White.copy(alpha = .72f), fontSize = 13.sp, lineHeight = 20.sp)
                }
            }
            Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(tr(arabic, "FEATURED COMMUNITY WORK", "أعمال المجتمع المختارة"), Modifier.weight(1f), color = Burgundy, fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 1.1.sp)
                Text("${projects.size} ${tr(arabic, if (projects.size == 1) "project" else "projects", "مشروع")}", color = Muted, fontSize = 11.sp)
            }
        }
        if (projects.isEmpty()) {
            item { EmptyState("◇", tr(arabic, "No selected projects yet", "لا توجد مشاريع مختارة بعد"), tr(arabic, "Curated member work will appear here.", "ستظهر أعمال الأعضاء المختارة هنا.")) }
        } else {
            items(projects, key = { it.id }) { post ->
                PostCard(
                    post = post,
                    space = viewModel.spaces.firstOrNull { it.slug == post.communitySlug },
                    member = viewModel.members[post.userId],
                    members = viewModel.members,
                    arabic = arabic,
                    onVote = { viewModel.vote(post, it) },
                    signedIn = viewModel.currentUser != null,
                    onComments = { onComments(post) },
                    onMember = { member -> member?.let(onMember) },
                    onSpace = { slug -> viewModel.selectedSpace = slug; viewModel.screen = CommunityScreen.HOME },
                    canModerate = viewModel.canManageSpace(post.communitySlug),
                    onModerate = { action, reason -> viewModel.moderateSpacePost(post, action, reason) {} },
                    chatSpaces = viewModel.chatSpaces,
                    onShareToChat = { viewModel.sharePostToChat(post, it) },
                )
            }
        }
    }
}

@Composable
private fun QuestionOfTheWeekCard(post: CommunityPost, arabic: Boolean, onOpen: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth().padding(start = 10.dp, end = 10.dp, bottom = 14.dp),
        onClick = onOpen,
        color = Color.Transparent,
        shape = RoundedCornerShape(18.dp),
        shadowElevation = 10.dp,
    ) {
        Box(
            Modifier.fillMaxWidth()
                .background(Brush.linearGradient(listOf(BurgundyDark, Burgundy)))
                .padding(horizontal = 18.dp, vertical = 17.dp),
        ) {
            Text(
                "?",
                Modifier.align(Alignment.BottomEnd).offset(y = 30.dp),
                color = Gold.copy(alpha = .09f),
                fontFamily = MaterialTheme.typography.headlineLarge.fontFamily,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 128.sp,
                lineHeight = 128.sp,
            )
            Column(Modifier.fillMaxWidth()) {
                Text(tr(arabic, "QUESTION OF THE WEEK", "سؤال الأسبوع"), color = Gold, fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 1.3.sp)
                Text(post.title, Modifier.padding(top = 4.dp), color = Color.White, fontFamily = MaterialTheme.typography.titleLarge.fontFamily, fontSize = 18.4.sp, lineHeight = 25.sp, fontWeight = FontWeight.Bold)
                Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.Bottom) {
                    Text(
                        tr(arabic, "Asked by @", "سؤال من @") + (post.authorUsername.ifBlank { post.authorName.ifBlank { tr(arabic, "member", "عضو") } }),
                        Modifier.weight(1f),
                        color = Color.White.copy(alpha = .65f),
                        fontSize = 11.2.sp,
                    )
                    Text(tr(arabic, "Join the discussion  →", "شارك في النقاش  ←"), color = Gold, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold)
                }
            }
        }
    }
}

@Composable
private fun FirebaseSetupBanner(arabic: Boolean) {
    Surface(color = QuestionTint, border = BorderStroke(1.dp, Gold), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(tr(arabic, "Firebase connection required", "مطلوب ربط Firebase"), fontWeight = FontWeight.Bold, color = Burgundy)
            Text(tr(arabic, "Add google-services.json to androidApp to load the live community.", "أضف google-services.json إلى androidApp لتحميل المجتمع المباشر."), fontSize = 13.sp, color = Muted)
        }
    }
}

@Composable
private fun WelcomeCard(arabic: Boolean) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 10.dp),
        colors = CardDefaults.cardColors(containerColor = Color.Transparent),
        shape = RoundedCornerShape(24.dp),
    ) {
        Row(
            Modifier.fillMaxWidth().height(215.dp)
                .background(Brush.linearGradient(listOf(Color(0xFF451217), Burgundy, Clay)))
                .padding(horizontal = 25.dp, vertical = 27.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(tr(arabic, "THE STUDIO IS OPEN", "الاستوديو مفتوح"), color = Gold, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.4.sp)
                Text(tr(arabic, "What are you exploring?", "ماذا تستكشف؟"), color = Color.White, style = MaterialTheme.typography.headlineLarge, lineHeight = 37.sp)
                Text(tr(arabic, "Trade ideas, share work in progress, and meet the people shaping architecture in Basra.", "تبادل الأفكار، وشارك أعمالك قيد التطوير، وتعرّف على من يصنعون عمارة البصرة."), color = Color.White.copy(alpha = .75f), fontSize = 14.sp, lineHeight = 23.sp)
            }
            Text("A", color = Gold.copy(alpha = .45f), fontSize = 56.sp, fontFamily = MaterialTheme.typography.headlineLarge.fontFamily)
        }
    }
}

@Composable
private fun AreaHeader(space: CommunitySpace?, connected: Boolean, owned: Boolean, canManage: Boolean, pending: Boolean, messageAccess: SpaceAccess?, arabic: Boolean, onBack: () -> Unit, onMessages: () -> Unit, onConnect: () -> Unit) {
    val context = LocalContext.current
    Card(
        modifier = Modifier.fillMaxWidth().padding(14.dp),
        colors = CardDefaults.cardColors(containerColor = BurgundyDark),
        shape = RoundedCornerShape(24.dp),
    ) {
        Box {
            FirebaseImage(space?.bannerBase64.orEmpty(), "", Modifier.matchParentSize(), ContentScale.Crop)
            Box(Modifier.matchParentSize().background(BurgundyDark.copy(alpha = if (space?.bannerBase64.isNullOrBlank()) 0f else .65f)))
        Column(Modifier.padding(20.dp)) {
            Text("←  ${tr(arabic, "ALL COMMUNITY", "كل المجتمع")}", Modifier.clickable(onClick = onBack), color = Gold, fontWeight = FontWeight.Bold, fontSize = 10.sp)
            Text("a/${space?.slug.orEmpty()}", Modifier.padding(top = 14.dp), color = Gold, fontSize = 11.sp, fontWeight = FontWeight.Black, letterSpacing = 1.2.sp)
            Text(space?.name ?: tr(arabic, "Community space", "مساحة مجتمعية"), Modifier.padding(top = 3.dp), color = Color.White, style = MaterialTheme.typography.headlineMedium)
            Text(space?.description.orEmpty(), Modifier.padding(top = 7.dp), color = Color.White.copy(alpha = .72f), fontSize = 13.sp, lineHeight = 19.sp)
            if (space?.isPrivate == true) Text("◐  ${tr(arabic, "Private space", "مساحة خاصة")}", Modifier.padding(top = 8.dp), color = Gold, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            else if (space?.isViewOnly == true) Text("◎  ${tr(arabic, "View only", "للعرض فقط")}", Modifier.padding(top = 8.dp), color = Gold, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            if (space != null) OutlinedButton(
                onClick = {
                    shareCommunityLink(
                        context,
                        "${space.name}\nhttps://space-42d87.web.app/share/space/${space.slug}",
                        space.name,
                        tr(arabic, "Share space", "مشاركة المساحة"),
                    )
                },
                modifier = Modifier.padding(top = 12.dp),
                border = BorderStroke(1.dp, Gold.copy(alpha = .55f)),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Gold),
                shape = RoundedCornerShape(12.dp),
            ) { Text("${tr(arabic, "Share space", "مشاركة المساحة")}  ↗", fontWeight = FontWeight.Bold) }
            if (space != null && (connected || owned || canManage)) OutlinedButton(
                onClick = onMessages,
                modifier = Modifier.padding(top = 8.dp),
                border = BorderStroke(1.dp, if (messageAccess?.chatBanned == true) Color(0xFFFF8A80) else Color.White.copy(alpha = .35f)),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = if (messageAccess?.chatBanned == true) Color(0xFFFF8A80) else Color.White),
                shape = RoundedCornerShape(12.dp),
            ) {
                val label = when {
                    !space.chatEnabled -> tr(arabic, "Add Messages", "إضافة الرسائل")
                    messageAccess?.chatBanned == true -> tr(arabic, "Request Messages access", "طلب الوصول إلى الرسائل")
                    messageAccess != null && !messageAccess.canUseChat -> tr(arabic, "Request Messages access", "طلب الوصول إلى الرسائل")
                    else -> tr(arabic, "Messages", "الرسائل")
                }
                Text("◯  $label", fontWeight = FontWeight.Bold)
            }
            if (!owned && space != null) Button(
                onClick = onConnect,
                modifier = Modifier.padding(top = 14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = if (connected) Color.White.copy(alpha = .16f) else Gold, contentColor = if (connected) Color.White else BurgundyDark),
                shape = RoundedCornerShape(12.dp),
                enabled = !pending,
            ) { Text(when { connected -> tr(arabic, "Connected · Disconnect", "متصل · إلغاء الاتصال"); pending -> tr(arabic, "Access requested", "تم طلب الوصول"); space.isPrivate || space.isViewOnly -> tr(arabic, "Request to connect", "طلب الاتصال"); else -> tr(arabic, "Connect to this space", "اتصل بهذه المساحة") }, fontWeight = FontWeight.Bold) }
        }
        }
    }
}

@Composable
private fun PrivateSpaceGate(space: CommunitySpace, pending: Boolean, arabic: Boolean) {
    Surface(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 4.dp), color = SandLight, shape = RoundedCornerShape(18.dp), border = BorderStroke(1.dp, Gold)) {
        Column(Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("◐", color = Burgundy, fontSize = 30.sp)
            Text(tr(arabic, "This space is private", "هذه المساحة خاصة"), Modifier.padding(top = 7.dp), fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
            Text(
                tr(arabic, "a/${space.slug} is available to approved members only.${if (pending) " Your request is pending." else " Request access from its owner."}", "مساحة a/${space.slug} متاحة للأعضاء الموافق عليهم فقط.${if (pending) " طلبك قيد المراجعة." else " اطلب الوصول من مالكها."}"),
                Modifier.padding(top = 6.dp), color = Muted, fontSize = 12.sp, lineHeight = 18.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
        }
    }
}

@Composable
private fun QuickComposer(arabic: Boolean, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().padding(start = 10.dp, end = 10.dp, top = 14.dp, bottom = 22.dp).height(66.dp),
        shape = RoundedCornerShape(18.dp),
        color = Paper,
        border = BorderStroke(1.dp, Line),
    ) {
        Row(Modifier.padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Avatar("AIAS", "", "", 44)
            Text(tr(arabic, "Share an idea with the community…", "شارك فكرة مع المجتمع…"), Modifier.padding(horizontal = 12.dp).weight(1f), color = Muted, fontSize = 13.sp)
            Text(tr(arabic, "Create", "إنشاء"), color = Burgundy, fontWeight = FontWeight.Bold, fontSize = 12.sp)
        }
    }
}

@Composable
private fun FeedControls(viewModel: CommunityViewModel, arabic: Boolean, count: Int) {
    var showTypes by rememberSaveable { mutableStateOf(false) }
    Column(Modifier.background(Paper).padding(top = 6.dp, bottom = 4.dp)) {
        if (viewModel.currentUser != null && viewModel.selectedSpace == null) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 2.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(Modifier.weight(1f)) { SortChip(tr(arabic, "For you", "لك"), viewModel.discoverFeed) { viewModel.discoverFeed = true; viewModel.sort = FeedSort.RECOMMENDED } }
                Box(Modifier.weight(1f)) { SortChip(tr(arabic, "Following", "متابَعة"), !viewModel.discoverFeed) { viewModel.discoverFeed = false; viewModel.sort = FeedSort.LATEST } }
                Box(Modifier.weight(1f)) { SortChip(tr(arabic, "Selected", "مختارة"), viewModel.screen == CommunityScreen.SELECTED) { viewModel.screen = CommunityScreen.SELECTED } }
            }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            SortChip(tr(arabic, "Recommended", "مقترحة"), viewModel.sort == FeedSort.RECOMMENDED) { viewModel.sort = FeedSort.RECOMMENDED }
            SortChip(tr(arabic, "Latest", "الأحدث"), viewModel.sort == FeedSort.LATEST) { viewModel.sort = FeedSort.LATEST }
            SortChip(tr(arabic, "Popular", "الأكثر رواجاً"), viewModel.sort == FeedSort.POPULAR) { viewModel.sort = FeedSort.POPULAR }
            Spacer(Modifier.weight(1f))
            TextButton(onClick = { showTypes = !showTypes }, contentPadding = PaddingValues(horizontal = 8.dp)) {
                Text(tr(arabic, "Type", "النوع"), color = Burgundy, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
        }
        if (showTypes) Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 2.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(tr(arabic, "All", "الكل"), viewModel.filter == PostFilter.ALL) { viewModel.filter = PostFilter.ALL }
            FilterChip(tr(arabic, "Thoughts", "أفكار"), viewModel.filter == PostFilter.THOUGHTS) { viewModel.filter = PostFilter.THOUGHTS }
            FilterChip(tr(arabic, "Questions", "أسئلة"), viewModel.filter == PostFilter.QUESTIONS) { viewModel.filter = PostFilter.QUESTIONS }
            FilterChip(tr(arabic, "Projects", "مشاريع"), viewModel.filter == PostFilter.PROJECTS) { viewModel.filter = PostFilter.PROJECTS }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(viewModel.spaces.firstOrNull { it.slug == viewModel.selectedSpace }?.name ?: tr(arabic, if (viewModel.discoverFeed) "Community feed" else "From your connections", if (viewModel.discoverFeed) "خلاصة المجتمع" else "من تواصلاتك"), Modifier.weight(1f), fontWeight = FontWeight.ExtraBold, fontSize = 17.sp)
            Text("$count ${tr(arabic, if (count == 1) "post" else "posts", "منشور")}", color = Muted, fontSize = 10.sp)
        }
    }
}

@Composable
private fun SortChip(text: String, selected: Boolean, onClick: () -> Unit) = MiniChip(text, selected, true, onClick)

@Composable
private fun FilterChip(text: String, selected: Boolean, onClick: () -> Unit) = MiniChip(text, selected, false, onClick)

@Composable
private fun MiniChip(text: String, selected: Boolean, dark: Boolean, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        color = if (selected) FilterActive else Color.Transparent,
        contentColor = if (selected) Burgundy else Color(0xFF766B6C),
        shape = RoundedCornerShape(10.dp),
    ) { Text(text, Modifier.padding(horizontal = 10.dp, vertical = 8.dp), fontSize = 11.sp, fontWeight = FontWeight.Bold, textAlign = androidx.compose.ui.text.style.TextAlign.Center, maxLines = 1) }
}

@Composable
private fun PostCard(
    post: CommunityPost,
    space: CommunitySpace?,
    member: Member?,
    members: Map<String, Member>,
    arabic: Boolean,
    onVote: (Int) -> Unit,
    signedIn: Boolean,
    onComments: () -> Unit,
    onMember: (Member?) -> Unit,
    onSpace: (String) -> Unit,
    canModerate: Boolean = false,
    onModerate: (String, String) -> Unit = { _, _ -> },
    showSpaceSource: Boolean = false,
    chatSpaces: List<CommunitySpace> = emptyList(),
    onShareToChat: (CommunitySpace) -> Unit = {},
) {
    val context = LocalContext.current
    var openImage by remember(post.id) { mutableStateOf<Int?>(null) }
    var applauseBurst by remember(post.id) { mutableStateOf(0) }
    var moderationChoice by remember(post.id) { mutableStateOf<String?>(null) }
    var moderationReason by remember(post.id) { mutableStateOf("") }
    var shareOpen by remember(post.id) { mutableStateOf(false) }
    val burstProgress = remember(post.id) { Animatable(1f) }
    LaunchedEffect(applauseBurst) {
        if (applauseBurst == 0) return@LaunchedEffect
        burstProgress.snapTo(0f)
        burstProgress.animateTo(1f, tween(550))
    }
    fun applaud() {
        if (post.meta.mine == 1) return
        if (signedIn) applauseBurst += 1
        onVote(1)
    }
    val kind = when (post.type) {
        "question" -> tr(arabic, "Open question", "سؤال مفتوح")
        "behance" -> tr(arabic, "Project", "مشروع")
        else -> tr(arabic, "Thought", "فكرة")
    }
    Box(Modifier.fillMaxWidth()) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 6.dp).combinedClickable(onClick = {}, onDoubleClick = ::applaud),
        shape = RoundedCornerShape(22.dp),
        border = BorderStroke(1.dp, Line.copy(alpha = 0.7f)),
        colors = CardDefaults.cardColors(containerColor = Paper),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 18.dp)) {
            if (showSpaceSource && post.communitySlug != "main" && space != null) {
                Surface(onClick = { onSpace(post.communitySlug) }, color = Burgundy.copy(alpha = .055f), shape = RoundedCornerShape(15.dp), border = BorderStroke(1.dp, Line)) {
                    Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(50.dp).clip(RoundedCornerShape(14.dp)).background(Burgundy), contentAlignment = Alignment.Center) {
                            if (space.imageBase64.isNotBlank()) FirebaseImage(space.imageBase64, "", Modifier.fillMaxSize(), ContentScale.Crop, space.name)
                            else Text(space.symbol, color = Gold, fontSize = 18.sp, fontWeight = FontWeight.Black)
                        }
                        Column(Modifier.padding(horizontal = 10.dp).weight(1f)) {
                            Text(tr(arabic, "Posted in", "نُشر في"), color = Muted, fontSize = 9.sp)
                            Text(space.name.ifBlank { "a/${space.slug}" }, color = BurgundyDark, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold)
                            Text("a/${space.slug}", color = Burgundy, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(tr(arabic, "Main thread", "المسار الرئيسي"), color = Burgundy, fontWeight = FontWeight.Bold, fontSize = 10.sp)
                    Text("  ·  $kind", color = Muted, fontSize = 10.sp)
                }
                Spacer(Modifier.height(13.dp))
            }
            Row(Modifier.clickable { onMember(member) }, verticalAlignment = Alignment.CenterVertically) {
                Avatar(member?.displayName ?: post.authorName, member?.photoBase64.orEmpty(), member?.photoUrl.orEmpty(), 42, member?.verified == true)
                Column(Modifier.padding(horizontal = 10.dp).weight(1f)) {
                    Text(member?.displayName ?: post.authorName, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(listOfNotNull(member?.school?.takeIf { it.isNotBlank() }, relativeTime(post.createdAt, arabic)).joinToString(" · "), color = Muted, fontSize = 11.sp)
                        if (post.editedAt != null) Text(" · ${tr(arabic, "Edited", "تم التعديل")}", color = Clay, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    }
                }
                Surface(color = if (post.type == "question") Gold.copy(alpha = .15f) else Burgundy.copy(alpha = .06f), shape = RoundedCornerShape(8.dp)) {
                    Text(kind.uppercase(), Modifier.padding(horizontal = 9.dp, vertical = 6.dp), color = Burgundy, fontSize = 8.sp, fontWeight = FontWeight.Black, letterSpacing = .7.sp)
                }
            }
            MentionText(
                value = post.title,
                modifier = Modifier.padding(top = 18.dp),
                style = MaterialTheme.typography.titleLarge.copy(fontSize = 18.5.sp, lineHeight = 24.sp, fontWeight = FontWeight.Bold),
                maxLines = 3,
                onUser = { username -> onMember(members.values.firstOrNull { it.username.equals(username, true) }) },
                onSpace = onSpace,
            )
            MentionText(
                value = post.content.ifBlank { post.summary },
                modifier = Modifier.padding(top = 8.dp),
                style = MaterialTheme.typography.bodyMedium.copy(color = Muted, fontSize = 14.4.sp, lineHeight = 24.5.sp),
                maxLines = 5,
                onUser = { username -> onMember(members.values.firstOrNull { it.username.equals(username, true) }) },
                onSpace = onSpace,
            )
            if (post.imageDataUrls.isNotEmpty()) PostImageGallery(post.imageDataUrls, post.title) { openImage = it }
            if (post.type == "behance" && post.behanceSrc.isNotBlank()) {
                ProjectPreview(post, arabic)
            }
            HorizontalDivider(Modifier.padding(top = 17.dp), color = Line)
            Row(Modifier.fillMaxWidth().padding(top = 15.dp), verticalAlignment = Alignment.CenterVertically) {
                Surface(shape = RoundedCornerShape(13.dp), color = Cream, border = BorderStroke(1.dp, Line)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        VoteButton("↑", post.meta.mine == 1) {
                            if (signedIn && post.meta.mine != 1) applauseBurst += 1
                            onVote(1)
                        }
                        Text(post.meta.score.toString(), Modifier.width(30.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        VoteButton("↓", post.meta.mine == -1) { onVote(-1) }
                    }
                }
                TextButton(onClick = onComments) {
                    Text("◯  ${post.meta.commentsCount} ${tr(arabic, if (post.type == "question") "answers" else "comments", if (post.type == "question") "إجابة" else "تعليق")}", color = Muted, fontSize = 11.sp)
                }
                Spacer(Modifier.weight(1f))
                TextButton(onClick = { shareOpen = true }) { Text("↗", color = Muted, fontSize = 18.sp) }
                if (canModerate) TextButton(onClick = { moderationChoice = "choose" }) { Text("⋮", color = Burgundy, fontSize = 21.sp, fontWeight = FontWeight.Bold) }
            }
        }
    }
    if (applauseBurst > 0 && burstProgress.value < 1f) {
        val progress = burstProgress.value
        Box(
            Modifier.align(Alignment.Center).offset(y = (-26 * progress).dp).scale(.72f + progress * .42f).alpha(1f - progress),
            contentAlignment = Alignment.Center,
        ) {
            Surface(color = Burgundy.copy(alpha = .94f), shape = CircleShape, shadowElevation = 10.dp) {
                Text("✦  ↑  ✦", Modifier.padding(horizontal = 20.dp, vertical = 13.dp), color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Black)
            }
        }
    }
    }
    openImage?.let { index -> PostImageViewer(post.imageDataUrls, index, post.title, arabic) { openImage = null } }
    if (moderationChoice == "choose") AlertDialog(
        onDismissRequest = { moderationChoice = null },
        title = { Text(tr(arabic, "Manage space post", "إدارة منشور المساحة"), fontWeight = FontWeight.ExtraBold) },
        text = { Text(tr(arabic, "Choose an action for this post.", "اختر إجراءً لهذا المنشور.")) },
        confirmButton = { TextButton(onClick = { moderationChoice = "warn" }) { Text(tr(arabic, "Warn", "تحذير"), color = Burgundy) } },
        dismissButton = { TextButton(onClick = { moderationChoice = "delete" }) { Text(tr(arabic, "Delete", "حذف"), color = Color(0xFFB3261E)) } },
        containerColor = Paper,
    )
    if (moderationChoice == "warn" || moderationChoice == "delete") AlertDialog(
        onDismissRequest = { moderationChoice = null; moderationReason = "" },
        title = { Text(tr(arabic, if (moderationChoice == "delete") "Delete post" else "Warn post", if (moderationChoice == "delete") "حذف المنشور" else "تحذير المنشور"), fontWeight = FontWeight.ExtraBold) },
        text = { OutlinedTextField(moderationReason, { moderationReason = it.take(500) }, Modifier.fillMaxWidth(), label = { Text(tr(arabic, "Reason (required)", "السبب (مطلوب)")) }, minLines = 3) },
        confirmButton = { TextButton(onClick = { val action = moderationChoice.orEmpty(); val reason = moderationReason.trim(); if (reason.length >= 3) { moderationChoice = null; moderationReason = ""; onModerate(action, reason) } }, enabled = moderationReason.trim().length >= 3) { Text(tr(arabic, "Confirm", "تأكيد"), color = if (moderationChoice == "delete") Color(0xFFB3261E) else Burgundy) } },
        dismissButton = { TextButton(onClick = { moderationChoice = null; moderationReason = "" }) { Text(tr(arabic, "Cancel", "إلغاء")) } },
        containerColor = Paper,
    )
    if (shareOpen) AlertDialog(
        onDismissRequest = { shareOpen = false },
        title = { Text(tr(arabic, "Share post", "مشاركة المنشور"), fontWeight = FontWeight.ExtraBold) },
        text = {
            Column(Modifier.fillMaxWidth()) {
                if (chatSpaces.isNotEmpty()) {
                    Text(tr(arabic, "SPACE MESSAGES", "رسائل المساحات"), color = Clay, fontSize = 10.sp, fontWeight = FontWeight.Black)
                    chatSpaces.forEach { chatSpace ->
                        Surface(
                            onClick = { shareOpen = false; onShareToChat(chatSpace) },
                            modifier = Modifier.fillMaxWidth().padding(top = 7.dp),
                            color = SandLight,
                            shape = RoundedCornerShape(12.dp),
                            border = BorderStroke(1.dp, Line),
                        ) {
                            Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                Avatar(chatSpace.name, chatSpace.imageBase64, "", 34)
                                Column(Modifier.padding(horizontal = 9.dp).weight(1f)) {
                                    Text(chatSpace.name, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                    Text("a/${chatSpace.slug}", color = Burgundy, fontSize = 10.sp)
                                }
                                Text("→", color = Burgundy, fontSize = 17.sp)
                            }
                        }
                    }
                } else {
                    Text(tr(arabic, "Connect to a space with Messages enabled to share posts there.", "اتصل بمساحة مفعّلة فيها الرسائل لمشاركة المنشورات هناك."), color = Muted, fontSize = 12.sp)
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                shareOpen = false
                shareCommunityLink(context, "${post.title}\nhttps://space-42d87.web.app/share/post/${post.id}", post.title, tr(arabic, "Share post", "مشاركة المنشور"))
            }) { Text(tr(arabic, "Share to another app", "مشاركة إلى تطبيق آخر"), color = Burgundy) }
        },
        dismissButton = { TextButton(onClick = { shareOpen = false }) { Text(tr(arabic, "Cancel", "إلغاء")) } },
        containerColor = Paper,
    )
}

@Composable
private fun PostImageGallery(images: List<String>, title: String, onOpen: (Int) -> Unit) {
    val visible = images.take(4)
    Column(Modifier.fillMaxWidth().padding(top = 14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        visible.chunked(2).forEach { rowImages ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                rowImages.forEachIndexed { localIndex, image ->
                    val index = visible.indexOf(image).takeIf { it >= 0 } ?: localIndex
                    Box(
                        Modifier.weight(1f).height(if (visible.size == 1) 250.dp else 155.dp).clip(RoundedCornerShape(10.dp)).background(SearchSurface).clickable { onOpen(index) },
                    ) {
                        FirebaseImage(image, "", Modifier.fillMaxSize(), ContentScale.Crop, title)
                        if (index == 3 && images.size > 4) Box(Modifier.matchParentSize().background(Color.Black.copy(alpha = .48f)), contentAlignment = Alignment.Center) {
                            Text("+${images.size - 4}", color = Color.White, fontSize = 25.sp, fontWeight = FontWeight.ExtraBold)
                        }
                    }
                }
                if (rowImages.size == 1 && visible.size > 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun PostImageViewer(images: List<String>, initial: Int, title: String, arabic: Boolean, dismiss: () -> Unit) {
    var index by remember(images, initial) { mutableStateOf(initial.coerceIn(images.indices)) }
    ModalBottomSheet(onDismissRequest = dismiss, containerColor = Color(0xFF171314), modifier = Modifier.statusBarsPadding()) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("${index + 1} / ${images.size}", Modifier.weight(1f), color = Color.White, fontWeight = FontWeight.Bold)
                TextButton(onClick = dismiss) { Text(tr(arabic, "Close", "إغلاق"), color = Color.White) }
            }
            Box(Modifier.fillMaxWidth().height(520.dp), contentAlignment = Alignment.Center) {
                FirebaseImage(images[index], "", Modifier.fillMaxSize(), ContentScale.Fit, title)
                if (index > 0) TextButton(onClick = { index -= 1 }, modifier = Modifier.align(Alignment.CenterStart)) { Text("‹", color = Color.White, fontSize = 40.sp) }
                if (index < images.lastIndex) TextButton(onClick = { index += 1 }, modifier = Modifier.align(Alignment.CenterEnd)) { Text("›", color = Color.White, fontSize = 40.sp) }
            }
        }
    }
}

@Composable
private fun VoteButton(symbol: String, active: Boolean, onClick: () -> Unit) {
    TextButton(onClick = onClick, contentPadding = PaddingValues(0.dp), modifier = Modifier.size(34.dp)) {
        Text(symbol, color = if (active) Burgundy else Muted, fontWeight = FontWeight.Bold, fontSize = 18.sp)
    }
}

@Composable
@SuppressLint("SetJavaScriptEnabled")
private fun ProjectPreview(post: CommunityPost, arabic: Boolean) {
    val context = LocalContext.current
    var loading by remember(post.id, post.behanceSrc) { mutableStateOf(true) }
    var failed by remember(post.id, post.behanceSrc) { mutableStateOf(false) }
    var embeddedView by remember(post.id) { mutableStateOf<WebView?>(null) }
    val projectUrl = "https://space-42d87.web.app/project.html?communityPost=${post.id}"

    DisposableEffect(post.id) {
        onDispose {
            embeddedView?.stopLoading()
            embeddedView?.destroy()
            embeddedView = null
        }
    }

    Box(
        Modifier.fillMaxWidth().padding(top = 18.dp).height(280.dp)
            .clip(RoundedCornerShape(14.dp)).background(Color(0xFFEEE9E4)).border(1.dp, Line, RoundedCornerShape(14.dp)),
    ) {
        if (!failed) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { webContext ->
                    WebView(webContext).apply {
                        embeddedView = this
                        setBackgroundColor(android.graphics.Color.WHITE)
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.loadsImagesAutomatically = true
                        settings.mediaPlaybackRequiresUserGesture = true
                        isVerticalScrollBarEnabled = true
                        isHorizontalScrollBarEnabled = false
                        webViewClient = object : WebViewClient() {
                            override fun onPageFinished(view: WebView?, url: String?) {
                                loading = false
                            }

                            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                                if (request?.isForMainFrame != false) {
                                    loading = false
                                    failed = true
                                }
                            }
                        }
                        loadUrl(post.behanceSrc)
                    }
                },
                update = { view ->
                    if (view.url != post.behanceSrc) view.loadUrl(post.behanceSrc)
                },
            )
        }
        if (loading && !failed) CircularProgressIndicator(Modifier.align(Alignment.Center), color = Burgundy)
        if (failed) {
            Column(Modifier.align(Alignment.Center).padding(22.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(tr(arabic, "Project preview is unavailable", "معاينة المشروع غير متاحة"), fontFamily = MaterialTheme.typography.titleMedium.fontFamily, fontWeight = FontWeight.Bold)
                Text(tr(arabic, "Open the full project to view it.", "افتح المشروع كاملاً لمشاهدته."), Modifier.padding(top = 5.dp), color = Muted, fontSize = 12.sp)
            }
        }
        Surface(
            onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(projectUrl))) },
            modifier = Modifier.align(Alignment.BottomEnd).padding(14.dp),
            color = BurgundyDark.copy(alpha = .92f),
            contentColor = Color.White,
            shape = RoundedCornerShape(11.dp),
            shadowElevation = 7.dp,
        ) {
            Text(tr(arabic, "Open project  ↗", "فتح المشروع  ↗"), Modifier.padding(horizontal = 12.dp, vertical = 9.dp), fontWeight = FontWeight.ExtraBold, fontSize = 12.sp)
            }
    }
}

@Composable
private fun SpacesScreen(viewModel: CommunityViewModel, arabic: Boolean) {
    var create by remember { mutableStateOf(false) }
    var editingSpace by remember { mutableStateOf<CommunitySpace?>(null) }
    var sort by rememberSaveable { mutableStateOf("popular") }
    var section by rememberSaveable { mutableStateOf(if (viewModel.ownedSpacesOnly) "mine" else "discover") }
    LaunchedEffect(viewModel.ownedSpacesOnly) { if (viewModel.ownedSpacesOnly) section = "mine" }
    val filteredSpaces = viewModel.spaces.filter { space ->
        !viewModel.isSpaceBlocked(space.slug) && (if (section == "mine") space.slug in viewModel.connectedSpaces || viewModel.canManageSpace(space.slug) else space.active)
    }
    val spaces = if (sort == "new") filteredSpaces.sortedByDescending { it.createdAt?.seconds ?: 0L }
    else filteredSpaces.sortedWith(
        compareByDescending<CommunitySpace> { space -> viewModel.posts.count { it.communitySlug == space.slug } }
            .thenByDescending { space -> viewModel.posts.filter { it.communitySlug == space.slug }.maxOfOrNull { it.createdAt?.seconds ?: 0L } ?: 0L }
            .thenBy { it.name.lowercase() },
    )
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(14.dp, 18.dp, 14.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { SortChip(tr(arabic, "Your spaces", "مساحاتك"), section == "mine") { section = "mine"; viewModel.ownedSpacesOnly = false } }
                Box(Modifier.weight(1f)) { SortChip(tr(arabic, "Discover", "اكتشف"), section == "discover") { section = "discover"; viewModel.ownedSpacesOnly = false } }
                IconButton(onClick = { create = true }, modifier = Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(Burgundy)) {
                    Icon(Icons.Default.Add, tr(arabic, "Create a space", "إنشاء مساحة"), tint = Color.White)
                }
            }
        }
        item {
            Surface(color = Paper, shape = RoundedCornerShape(16.dp), border = BorderStroke(1.dp, Line)) {
                Column(Modifier.padding(12.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        SpaceSortButton(tr(arabic, "Popular", "الأكثر شعبية"), sort == "popular", Modifier.weight(1f)) { sort = "popular" }
                        SpaceSortButton(tr(arabic, "New", "الأحدث"), sort == "new", Modifier.weight(1f)) { sort = "new" }
                    }
                    Row(Modifier.fillMaxWidth().padding(top = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(tr(arabic, "${spaces.size} spaces", "${spaces.size} مساحات"), color = Muted, fontSize = 11.sp)
                        Spacer(Modifier.weight(1f))
                        Text(tr(arabic, if (section == "mine") "Connected and managed" else "Open the spaces that interest you", if (section == "mine") "المتصلة والمدارة" else "افتح المساحات التي تهمك"), color = Muted, fontSize = 10.sp)
                    }
                }
            }
        }
        if (spaces.isEmpty()) item { EmptyState("◇", tr(arabic, "No spaces found", "لم يتم العثور على مساحات"), tr(arabic, "Try another search or create a member space.", "جرّب بحثاً آخر أو أنشئ مساحة للأعضاء.")) }
        items(spaces, key = { it.slug }) { space ->
            SpaceCard(
                space = space,
                owned = viewModel.canManageSpace(space.slug),
                arabic = arabic,
                onOpen = { viewModel.selectedSpace = space.slug; viewModel.screen = CommunityScreen.HOME },
                onEdit = { editingSpace = space },
            )
        }
    }
    if (create) CreateSpaceDialog(viewModel, arabic) { create = false }
    editingSpace?.let { space -> EditSpaceDialog(viewModel, space, arabic) { editingSpace = null } }
}

@Composable
private fun SpaceSortButton(label: String, selected: Boolean, modifier: Modifier = Modifier, action: () -> Unit) {
    Surface(onClick = action, modifier = modifier, color = if (selected) BurgundyDark else Cream, contentColor = if (selected) Color.White else Ink, shape = RoundedCornerShape(11.dp)) {
        Text(label, Modifier.padding(vertical = 10.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun SpaceCard(space: CommunitySpace, owned: Boolean, arabic: Boolean, onOpen: () -> Unit, onEdit: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = Paper), border = BorderStroke(1.dp, Line), shape = RoundedCornerShape(20.dp)) {
        Column {
            Box(Modifier.fillMaxWidth().height(92.dp).background(BurgundyDark)) {
                FirebaseImage(space.bannerBase64, "", Modifier.fillMaxSize(), ContentScale.Crop)
                Box(Modifier.matchParentSize().background(BurgundyDark.copy(alpha = if (space.bannerBase64.isBlank()) 0f else .32f)))
                Box(Modifier.align(Alignment.BottomStart).padding(12.dp).size(54.dp).clip(RoundedCornerShape(14.dp)).background(Paper).border(1.dp, Line, RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) {
                    if (space.imageBase64.isNotBlank()) FirebaseImage(space.imageBase64, "", Modifier.fillMaxSize(), ContentScale.Crop)
                    else Text(space.symbol.ifBlank { initials(space.name) }, color = Burgundy, fontFamily = MaterialTheme.typography.titleLarge.fontFamily, fontSize = 28.sp, fontWeight = FontWeight.Bold)
                }
            }
            Column(Modifier.padding(16.dp)) {
                Text("a/${space.slug}", color = Burgundy, fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 1.sp)
                Row(Modifier.padding(top = 5.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    if (space.isPrivate) Text("◐ ${tr(arabic, "Private", "خاصة")}", color = Burgundy, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                    else if (space.isViewOnly) Text("◎ ${tr(arabic, "View only", "للعرض فقط")}", color = Burgundy, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                    Text(if (space.showInMainThread && !space.isPrivate) tr(arabic, "⌁ Main thread", "⌁ المسار الرئيسي") else tr(arabic, "Space only", "داخل المساحة فقط"), color = Muted, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                }
                Text(space.name, Modifier.padding(top = 5.dp), fontFamily = MaterialTheme.typography.titleLarge.fontFamily, fontSize = 23.sp, fontWeight = FontWeight.Bold)
                Text(space.description.ifBlank { tr(arabic, "A member space for community conversation.", "مساحة للأعضاء وحوارات المجتمع.") }, Modifier.padding(top = 6.dp), color = Muted, fontSize = 13.sp, lineHeight = 19.sp)
                Row(Modifier.fillMaxWidth().padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(tr(arabic, "Open space →", "فتح المساحة ←"), Modifier.clickable(onClick = onOpen), color = Burgundy, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    Spacer(Modifier.weight(1f))
                    if (owned) TextButton(onClick = onEdit, contentPadding = PaddingValues(horizontal = 9.dp, vertical = 4.dp)) { Text(tr(arabic, "Edit", "تعديل"), color = Burgundy, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                }
            }
        }
    }
}

@Composable
private fun DisconnectSpaceDialog(space: CommunitySpace, arabic: Boolean, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(tr(arabic, "Disconnect from a/${space.slug}?", "إلغاء الاتصال من a/${space.slug}؟"), fontWeight = FontWeight.Bold) },
        text = { Text(tr(arabic, "All of your posts in this space will be permanently deleted. This cannot be undone.", "سيتم حذف جميع منشوراتك في هذه المساحة نهائياً. لا يمكن التراجع عن ذلك.")) },
        confirmButton = { TextButton(onClick = onConfirm) { Text(tr(arabic, "Delete posts and disconnect", "حذف المنشورات وإلغاء الاتصال"), color = Color(0xFFB3261E), fontWeight = FontWeight.Bold) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(tr(arabic, "Cancel", "إلغاء")) } },
        shape = RoundedCornerShape(20.dp),
        containerColor = Paper,
    )
}

@Composable
private fun CreatePostScreen(viewModel: CommunityViewModel, arabic: Boolean) {
    if (viewModel.currentUser == null || viewModel.currentProfile?.profileComplete != true) {
        Box(Modifier.fillMaxSize().padding(20.dp), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                EmptyState("+", tr(arabic, "Join the conversation", "انضم إلى الحوار"), tr(arabic, "Sign in before creating a community post.", "سجّل الدخول قبل إنشاء منشور مجتمعي."))
                Button(onClick = { viewModel.screen = CommunityScreen.PROFILE }, colors = ButtonDefaults.buttonColors(containerColor = Burgundy)) { Text(tr(arabic, "Sign in", "تسجيل الدخول")) }
            }
        }
        return
    }
    var type by rememberSaveable { mutableStateOf("text") }
    var title by rememberSaveable { mutableStateOf("") }
    var content by rememberSaveable { mutableStateOf("") }
    var behance by rememberSaveable { mutableStateOf("") }
    var images by remember { mutableStateOf<List<String>>(emptyList()) }
    var imagesBusy by remember { mutableStateOf(false) }
    val postingSpaces = viewModel.spaces.filter { it.creatorId == viewModel.currentUser?.uid || it.slug in viewModel.connectedSpaces }
    val initialSpace = viewModel.selectedSpace?.takeIf { slug -> postingSpaces.any { it.slug == slug } }?.let { "a/$it" } ?: "main"
    var spaceHandle by rememberSaveable(viewModel.currentUser?.uid, viewModel.selectedSpace) { mutableStateOf(initialSpace) }
    val normalizedSpace = if (spaceHandle.trim().equals("main", true)) "main" else normalizeSpaceInput(spaceHandle)
    val validSpace = viewModel.canPostToSpace(normalizedSpace)
    val selectedPostingSpace = viewModel.spaces.firstOrNull { it.slug == normalizedSpace }
    val spaceSuggestions = postingSpaces.filter { spaceHandle.isBlank() || it.slug.contains(normalizeSpaceInput(spaceHandle)) || it.name.contains(spaceHandle, true) }.take(5)
    LazyColumn(Modifier.fillMaxSize().imePadding(), contentPadding = PaddingValues(16.dp, 18.dp, 16.dp, 28.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { SectionHeader(tr(arabic, "ADD TO THE CONVERSATION", "شارك في الحوار"), tr(arabic, "Create a post", "إنشاء منشور"), tr(arabic, "Share a thought, ask an open question, or add a project.", "شارك فكرة أو اطرح سؤالاً مفتوحاً أو أضف مشروعاً.")) }
        item {
            Text(tr(arabic, "What are you sharing?", "ماذا تريد أن تشارك؟"), fontWeight = FontWeight.Bold)
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TypeChoice(tr(arabic, "Thought", "فكرة"), type == "text") { type = "text" }
                TypeChoice(tr(arabic, "Open question", "سؤال مفتوح"), type == "question") { type = "question" }
                TypeChoice(tr(arabic, "Add project", "إضافة مشروع"), type == "behance") { type = "behance"; spaceHandle = "main" }
            }
        }
        if (type != "behance") item {
            CommunityField(spaceHandle, { spaceHandle = it.take(36) }, tr(arabic, "Space handle", "معرّف المساحة"), tr(arabic, "main or a/community-name", "main أو a/community-name"), singleLine = true)
            Text(
                if (validSpace) tr(arabic, if (normalizedSpace == "main") "Posting to the main thread." else if (selectedPostingSpace?.showInMainThread != false) "Posting to a/$normalizedSpace and the main thread." else "Posting to a/$normalizedSpace only.", if (normalizedSpace == "main") "سيُنشر في المسار الرئيسي." else if (selectedPostingSpace?.showInMainThread != false) "سيُنشر في a/$normalizedSpace وفي المسار الرئيسي." else "سيُنشر في a/$normalizedSpace فقط.") else tr(arabic, "You can only post in spaces you own or are connected to.", "يمكنك النشر فقط في المساحات التي تملكها أو تتصل بها."),
                Modifier.padding(top = 4.dp), color = if (validSpace) Color(0xFF287A45) else Color(0xFFB3261E), fontSize = 11.sp,
            )
            if (spaceHandle.lowercase() != "main" && spaceSuggestions.isNotEmpty()) Column(Modifier.fillMaxWidth().padding(top = 5.dp).border(1.dp, Line, RoundedCornerShape(12.dp))) {
                spaceSuggestions.forEach { space ->
                    Row(Modifier.fillMaxWidth().clickable { spaceHandle = "a/${space.slug}" }.padding(horizontal = 12.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("a/${space.slug}", color = Burgundy, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                        Text(space.name, Modifier.padding(horizontal = 8.dp), color = Muted, fontSize = 11.sp)
                    }
                }
            }
        }
        if (type == "behance") item {
            CommunityField(behance, { behance = it }, tr(arabic, "Behance project embed link", "رابط تضمين مشروع Behance"), "https://www.behance.net/embed/project/…", singleLine = true)
            Text(tr(arabic, "In Behance choose Share → Embed, then paste the iframe code or link.", "في Behance اختر مشاركة ← تضمين، ثم الصق كود iframe أو الرابط."), color = Muted, fontSize = 11.sp)
        }
        item {
            CommunityField(title, { if (it.length <= 160) title = it }, tr(arabic, "Give it a clear title", "اكتب عنواناً واضحاً"), tr(arabic, "A clear question or insight", "سؤال واضح أو فكرة موجزة"), singleLine = true, counter = "${title.length} / 160")
            MentionSuggestions(title, viewModel.members.values.toList(), viewModel.spaces, arabic) { title = completeMention(title, it).take(160) }
        }
        item {
            CommunityField(content, { if (it.length <= 2000) content = it }, tr(arabic, if (type == "text") "Tell the community more (optional)" else if (type == "behance") "Describe your project" else "Add helpful context", if (type == "text") "أخبر المجتمع بالمزيد (اختياري)" else if (type == "behance") "صف مشروعك" else "أضف سياقاً مفيداً"), tr(arabic, "Share context, a fresh perspective, or invite feedback…", "شارك السياق أو منظوراً جديداً أو اطلب الآراء…"), minLines = 7, counter = "${content.length} / 2,000")
            MentionSuggestions(content, viewModel.members.values.toList(), viewModel.spaces, arabic) { content = completeMention(content, it).take(2000) }
        }
        if (type == "text") item {
            PostImagePicker(images, arabic, onImages = { images = it }, onBusy = { imagesBusy = it }, onError = viewModel::showMessage)
        }
        item {
            Button(
                onClick = {
                    val embed = extractBehance(behance)
                    when {
                        title.isBlank() || (type != "text" && content.isBlank()) -> viewModel.showMessage(tr(arabic, "Add a title before publishing.", "أضف عنواناً قبل النشر."))
                        imagesBusy -> viewModel.showMessage(tr(arabic, "Wait for the images to finish preparing.", "انتظر حتى يكتمل تجهيز الصور."))
                        type == "behance" && embed.isBlank() -> viewModel.showMessage(tr(arabic, "Paste a valid Behance embed link.", "الصق رابط تضمين صالحاً من Behance."))
                        type != "behance" && !validSpace -> viewModel.showMessage(tr(arabic, "Connect to this space or choose a space you own.", "اتصل بهذه المساحة أو اختر مساحة تملكها."))
                        else -> viewModel.publish(type, title, content, embed, normalizedSpace, images) { success -> if (success) { title = ""; content = ""; behance = ""; images = emptyList(); viewModel.screen = CommunityScreen.HOME } }
                    }
                },
                modifier = Modifier.fillMaxWidth().height(52.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Burgundy),
                shape = RoundedCornerShape(14.dp),
            ) { Text(tr(arabic, "Publish post  →", "نشر المنشور  ←"), fontWeight = FontWeight.Bold) }
        }
    }
}

@Composable
private fun TypeChoice(label: String, selected: Boolean, action: () -> Unit) {
    Surface(onClick = action, color = if (selected) BurgundyDark else Paper, contentColor = if (selected) Color.White else Ink, border = BorderStroke(1.dp, if (selected) BurgundyDark else Line), shape = RoundedCornerShape(14.dp)) {
        Text(label, Modifier.padding(horizontal = 16.dp, vertical = 13.dp), fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun ProfileScreen(viewModel: CommunityViewModel, arabic: Boolean) {
    if (viewModel.currentUser == null) {
        AuthScreen(viewModel, arabic)
        return
    }
    val profile = viewModel.currentProfile
    if (profile == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Burgundy) }
        return
    }
    if (!profile.profileComplete) {
        CompleteGoogleProfileScreen(viewModel, profile, arabic)
        return
    }
    var editing by remember { mutableStateOf(false) }
    var selectedPost by remember { mutableStateOf<CommunityPost?>(null) }
    var editingPost by remember { mutableStateOf<CommunityPost?>(null) }
    var deletingPost by remember { mutableStateOf<CommunityPost?>(null) }
    var commentsPost by remember { mutableStateOf<CommunityPost?>(null) }
    var profileViewMode by rememberSaveable { mutableStateOf("grid") }
    var profileSection by rememberSaveable { mutableStateOf("posts") }
    var showPrivate by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(viewModel.posts, selectedPost?.id) {
        selectedPost?.id?.let { id -> selectedPost = viewModel.posts.firstOrNull { it.id == id } }
    }
    val allMine = viewModel.posts.filter { post ->
        post.userId == viewModel.currentUser?.uid && (showPrivate || viewModel.spaces.firstOrNull { it.slug == post.communitySlug }?.isPrivate != true)
    }.sortedByDescending { it.createdAt?.seconds ?: 0 }
    val sectionMine = if (profileSection == "projects") allMine.filter { it.type == "behance" } else allMine
    val mine = if (profileViewMode == "grid") sectionMine.filter { it.imageDataUrls.isNotEmpty() || it.type == "behance" } else sectionMine
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = 28.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item(span = { GridItemSpan(2) }) {
            Column {
                Box(Modifier.fillMaxWidth().height(145.dp).background(BurgundyDark)) {
                    FirebaseImage(profile.bannerBase64, "", Modifier.fillMaxSize(), ContentScale.Crop)
                    Text("A", Modifier.align(Alignment.CenterEnd).padding(20.dp), color = Gold.copy(alpha = .3f), fontSize = 80.sp, fontFamily = MaterialTheme.typography.headlineLarge.fontFamily)
                }
                Column(Modifier.padding(horizontal = 6.dp)) {
                    Box { Avatar(profile.displayName, profile.photoBase64, profile.photoUrl, 76, profile.verified) }
                    Text(profile.displayName, Modifier.padding(top = 10.dp), fontFamily = MaterialTheme.typography.headlineMedium.fontFamily, fontSize = 29.sp, fontWeight = FontWeight.Bold)
                    Text(if (profile.username.isBlank()) tr(arabic, "Community member", "عضو في المجتمع") else "@${profile.username}", color = Burgundy, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    Text(listOf(profile.school, profile.city).filter { it.isNotBlank() }.joinToString(" · "), Modifier.padding(top = 5.dp), color = Muted, fontSize = 12.sp)
                    if (profile.bio.isNotBlank()) Text(profile.bio, Modifier.padding(top = 12.dp), lineHeight = 20.sp, fontSize = 14.sp)
                    Row(Modifier.fillMaxWidth().padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        ProfileStat(allMine.size, tr(arabic, "Posts", "منشورات"), Modifier.weight(1f))
                        ProfileStat(viewModel.connectedUsers.size, tr(arabic, "Connections", "تواصلات"), Modifier.weight(1f))
                        ProfileStat(viewModel.connectedSpaces.size, tr(arabic, "Spaces", "مساحات"), Modifier.weight(1f))
                    }
                    Row(Modifier.padding(top = 15.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { editing = true }, modifier = Modifier.weight(1f), colors = ButtonDefaults.buttonColors(containerColor = Burgundy), shape = RoundedCornerShape(12.dp)) { Text(tr(arabic, "Edit profile", "تعديل الملف"), fontSize = 12.sp) }
                        OutlinedButton(onClick = { viewModel.screen = CommunityScreen.SETTINGS }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp)) { Text(tr(arabic, "More", "المزيد"), fontSize = 12.sp) }
                    }
                    Surface(Modifier.fillMaxWidth().padding(top = 14.dp), color = if (profile.mainThreadPostingAccess) Color(0xFFF0FAF3) else Color(0xFFFFF6E9), shape = RoundedCornerShape(14.dp), border = BorderStroke(1.dp, if (profile.mainThreadPostingAccess) Color(0xFFB9D9C6) else Color(0xFFE8C6A5))) {
                        Column(Modifier.padding(13.dp)) {
                            Text(tr(arabic, if (profile.mainThreadPostingAccess) "Main-thread posting approved" else "Main-thread posting access required", if (profile.mainThreadPostingAccess) "تمت الموافقة على النشر في المسار الرئيسي" else "مطلوب تصريح للنشر في المسار الرئيسي"), fontWeight = FontWeight.ExtraBold, fontSize = 12.sp)
                            Text(tr(arabic, if (profile.mainThreadPostingAccess) "You can post publicly and create public spaces." else "You can browse and post in private spaces. Apply for admin approval to post publicly or create public spaces.", if (profile.mainThreadPostingAccess) "يمكنك النشر علناً وإنشاء مساحات عامة." else "يمكنك التصفح والنشر في المساحات الخاصة. اطلب موافقة المشرف للنشر علناً أو إنشاء مساحات عامة."), Modifier.padding(top = 4.dp), color = Muted, fontSize = 10.sp, lineHeight = 15.sp)
                            if (!profile.mainThreadPostingAccess) Button(onClick = { viewModel.requestMainThreadPostingAccess {} }, enabled = profile.mainThreadAccessStatus != "pending", modifier = Modifier.padding(top = 8.dp), colors = ButtonDefaults.buttonColors(containerColor = Burgundy)) {
                                Text(tr(arabic, if (profile.mainThreadAccessStatus == "pending") "Request pending" else "Apply for access", if (profile.mainThreadAccessStatus == "pending") "الطلب قيد المراجعة" else "طلب التصريح"), fontSize = 11.sp)
                            }
                        }
                    }
                    HorizontalDivider(Modifier.padding(top = 20.dp, bottom = 15.dp), color = Line)
                    Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(Modifier.weight(1f)) { SortChip(tr(arabic, "Posts", "المنشورات"), profileSection == "posts") { profileSection = "posts" } }
                        Box(Modifier.weight(1f)) { SortChip(tr(arabic, "Projects", "المشاريع"), profileSection == "projects") { profileSection = "projects"; profileViewMode = "grid" } }
                        Box(Modifier.weight(1f)) { SortChip(tr(arabic, "Spaces", "المساحات"), false) { viewModel.ownedSpacesOnly = true; viewModel.screen = CommunityScreen.SPACES } }
                    }
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                        Text(tr(arabic, if (profileSection == "projects") "Projects" else "Posts", if (profileSection == "projects") "المشاريع" else "المنشورات"), Modifier.weight(1f), fontFamily = MaterialTheme.typography.titleLarge.fontFamily, fontSize = 21.sp, fontWeight = FontWeight.Bold)
                        Text(if (profileViewMode == "thread") tr(arabic, "${allMine.size} posts", "${allMine.size} منشور") else tr(arabic, "${mine.size} image posts", "${mine.size} منشور مصور"), color = Muted, fontSize = 11.sp)
                    }
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        TypeChoice(tr(arabic, "▦ Grid", "▦ شبكة الصور"), profileViewMode == "grid") { profileViewMode = "grid" }
                        TypeChoice(tr(arabic, "☰ Thread", "☰ المسار"), profileViewMode == "thread") { profileViewMode = "thread" }
                    }
                    Text(
                        if (showPrivate) tr(arabic, "Hide private-space posts", "إخفاء منشورات المساحات الخاصة") else tr(arabic, "Show my private-space posts", "عرض منشوراتي في المساحات الخاصة"),
                        Modifier.clickable { showPrivate = !showPrivate }.padding(top = 10.dp, bottom = 2.dp), color = Burgundy, fontSize = 10.sp, fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.height(6.dp))
                }
            }
        }
        if (mine.isEmpty()) item(span = { GridItemSpan(2) }) { EmptyFeed(false, arabic) }
        gridItems(mine, key = { it.id }, span = { GridItemSpan(if (profileViewMode == "thread") 2 else 1) }) { post ->
            if (profileViewMode == "grid") ProfilePostTile(post, viewModel.spaces.firstOrNull { it.slug == post.communitySlug }, arabic) { selectedPost = post }
            else PostCard(
                post = post,
                space = viewModel.spaces.firstOrNull { it.slug == post.communitySlug },
                member = profile,
                members = viewModel.members,
                arabic = arabic,
                onVote = { viewModel.vote(post, it) },
                signedIn = true,
                onComments = { commentsPost = post },
                onMember = {},
                onSpace = { slug -> viewModel.selectedSpace = slug; viewModel.screen = CommunityScreen.HOME },
                canModerate = viewModel.canManageSpace(post.communitySlug),
                onModerate = { action, reason -> viewModel.moderateSpacePost(post, action, reason) {} },
                chatSpaces = viewModel.chatSpaces,
                onShareToChat = { viewModel.sharePostToChat(post, it) },
            )
        }
    }
    selectedPost?.let { post ->
        FullScreenPostDialog(
            post,
            viewModel,
            arabic,
            returnToProfile = true,
            onBack = { selectedPost = null },
            onComments = { commentsPost = post },
            onSpace = { slug -> selectedPost = null; viewModel.selectedSpace = slug; viewModel.screen = CommunityScreen.HOME },
            onEdit = { editingPost = post },
            onDelete = { deletingPost = post },
        )
    }
    commentsPost?.let { post -> CommentsSheet(post, viewModel, arabic, onDismiss = { commentsPost = null }, onMember = {}) }
    editingPost?.let { post -> EditPostDialog(post, viewModel, arabic) { editingPost = null } }
    deletingPost?.let { post -> DeletePostDialog(post, viewModel, arabic, onDismiss = { deletingPost = null }) {
        viewModel.deletePost(post) { deleted ->
            if (deleted) selectedPost = null
            deletingPost = null
        }
    } }
    if (editing) EditProfileDialog(viewModel, profile, arabic) { editing = false }
}

@Composable
private fun ProfilePostTile(post: CommunityPost, space: CommunitySpace?, arabic: Boolean, onOpen: () -> Unit) {
    Card(onClick = onOpen, modifier = Modifier.fillMaxWidth().height(210.dp), colors = CardDefaults.cardColors(containerColor = BurgundyDark), shape = RoundedCornerShape(17.dp)) {
        Box(Modifier.fillMaxSize()) {
            when {
                post.imageDataUrls.isNotEmpty() -> FirebaseImage(post.imageDataUrls.first(), "", Modifier.fillMaxSize(), ContentScale.Crop, post.title)
                post.type == "behance" -> Box(Modifier.matchParentSize().background(Brush.linearGradient(listOf(BurgundyDark, Burgundy))), contentAlignment = Alignment.Center) { Text("Bē", color = Gold, fontSize = 34.sp, fontWeight = FontWeight.ExtraBold) }
                else -> Box(Modifier.matchParentSize().background(Brush.linearGradient(listOf(BurgundyDark, Clay))), contentAlignment = Alignment.Center) { Text(initials(post.title), color = Gold.copy(alpha = .7f), fontSize = 34.sp, fontWeight = FontWeight.ExtraBold) }
            }
            Box(Modifier.matchParentSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = .82f)))))
            Column(Modifier.align(Alignment.BottomStart).padding(12.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text(when (post.type) { "question" -> tr(arabic, "QUESTION", "سؤال"); "behance" -> tr(arabic, "PROJECT", "مشروع"); else -> tr(arabic, "THOUGHT", "فكرة") }, color = Gold, fontSize = 8.sp, fontWeight = FontWeight.Black)
                    if (post.editedAt != null) Text(tr(arabic, "EDITED", "معدّل"), color = Color.White, fontSize = 8.sp, fontWeight = FontWeight.Bold)
                    if (space?.isPrivate == true) Text(tr(arabic, "PRIVATE", "خاص"), color = Color.White, fontSize = 8.sp, fontWeight = FontWeight.Bold)
                }
                Text(post.title, Modifier.padding(top = 5.dp), color = Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis, fontSize = 13.sp, lineHeight = 17.sp, fontWeight = FontWeight.ExtraBold)
                Text("✦ ${post.meta.score}    ◯ ${post.meta.commentsCount}${if (post.imageDataUrls.size > 1) "    ▧ ${post.imageDataUrls.size}" else ""}", Modifier.padding(top = 7.dp), color = Color.White.copy(alpha = .8f), fontSize = 9.sp)
            }
        }
    }
}

@Composable
private fun ProfileStat(value: Int, label: String, modifier: Modifier = Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value.toString(), fontWeight = FontWeight.ExtraBold, fontSize = 17.sp)
        Text(label, color = Muted, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun ArchivedPostsScreen(viewModel: CommunityViewModel, arabic: Boolean) {
    var confirming by remember { mutableStateOf<CommunityPost?>(null) }
    LaunchedEffect(Unit) { viewModel.loadArchivedPosts() }
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp, 18.dp, 16.dp, 32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            SectionHeader(
                tr(arabic, "YOUR ARCHIVED ORIGINALS", "نسخك الأصلية المؤرشفة"),
                tr(arabic, "Posts from unavailable spaces", "منشورات المساحات غير المتاحة"),
                tr(arabic, "Only eligible posts appear here. Reposting creates a new main-thread post and keeps the original for audit.", "تظهر هنا المنشورات المؤهلة فقط. إعادة النشر تنشئ منشوراً جديداً في المسار الرئيسي وتُبقي الأصل للتدقيق."),
            )
        }
        item {
            Surface(color = Color(0xFFFFF8E8), shape = RoundedCornerShape(14.dp), border = BorderStroke(1.dp, Gold.copy(alpha = .45f))) {
                Text(tr(arabic, "Moderation-flagged content stays restricted until an administrator clears it. Nothing is silently moved or republished.", "يبقى المحتوى المعلّم من الإشراف مقيّداً حتى يزيل المسؤول العلامة. لا يتم نقل أو إعادة نشر أي شيء تلقائياً."), Modifier.padding(14.dp), color = Muted, fontSize = 12.sp, lineHeight = 18.sp)
            }
        }
        when {
            viewModel.archivedPostsLoading -> item { Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Burgundy) } }
            viewModel.archivedPosts.isEmpty() -> item { EmptyState("↶", tr(arabic, "No eligible archived posts", "لا توجد منشورات مؤرشفة مؤهلة"), tr(arabic, "Posts from unavailable spaces will appear here when they can be reposted.", "ستظهر هنا منشورات المساحات غير المتاحة عندما تكون مؤهلة لإعادة النشر.")) }
            else -> items(viewModel.archivedPosts, key = { it.id }) { post ->
                Surface(color = Paper, shape = RoundedCornerShape(18.dp), border = BorderStroke(1.dp, Line), shadowElevation = 1.dp) {
                    Column {
                        post.imageDataUrls.firstOrNull()?.let { image -> FirebaseImage(image, "", Modifier.fillMaxWidth().heightIn(max = 420.dp), ContentScale.Crop, post.title) }
                        Column(Modifier.padding(16.dp)) {
                            Text(post.title, fontFamily = MaterialTheme.typography.titleLarge.fontFamily, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
                            Text("a/${post.communitySlug} · ${relativeTime(post.archivedAt, arabic)}", color = Muted, fontSize = 10.sp, modifier = Modifier.padding(top = 4.dp))
                            Text(post.content, modifier = Modifier.padding(top = 11.dp), lineHeight = 20.sp)
                            Surface(Modifier.fillMaxWidth().padding(top = 12.dp), color = SandLight, shape = RoundedCornerShape(11.dp)) {
                                Text(tr(arabic, "Why this is here: ", "سبب وجوده هنا: ") + post.archiveReason.ifBlank { tr(arabic, "The original space is unavailable.", "المساحة الأصلية غير متاحة.") }, Modifier.padding(11.dp), color = Muted, fontSize = 11.sp)
                            }
                            Button(onClick = { confirming = post }, enabled = post.repostedPostId.isBlank(), modifier = Modifier.padding(top = 12.dp), colors = ButtonDefaults.buttonColors(containerColor = Burgundy), shape = RoundedCornerShape(11.dp)) {
                                Text(tr(arabic, if (post.repostedPostId.isBlank()) "Repost to main thread" else "Already reposted", if (post.repostedPostId.isBlank()) "إعادة النشر في المسار الرئيسي" else "أُعيد نشره"))
                            }
                        }
                    }
                }
            }
        }
    }
    confirming?.let { post ->
        AlertDialog(
            onDismissRequest = { confirming = null },
            title = { Text(tr(arabic, "Create a new main-thread post?", "إنشاء منشور جديد في المسار الرئيسي؟")) },
            text = { Text(tr(arabic, "The archived original will remain here for audit. This action never moves or silently republishes it.", "ستبقى النسخة الأصلية المؤرشفة هنا للتدقيق. لا ينقل هذا الإجراء المحتوى ولا يعيد نشره بصمت.")) },
            confirmButton = { Button(onClick = { viewModel.repostArchivedPost(post) { if (it) viewModel.screen = CommunityScreen.HOME }; confirming = null }, colors = ButtonDefaults.buttonColors(containerColor = Burgundy)) { Text(tr(arabic, "Create new post", "إنشاء منشور جديد")) } },
            dismissButton = { TextButton(onClick = { confirming = null }) { Text(tr(arabic, "Cancel", "إلغاء")) } },
        )
    }
}

@Composable
private fun SettingsScreen(
    viewModel: CommunityViewModel,
    arabic: Boolean,
    nativeNotificationsEnabled: Boolean,
    onNativeNotifications: () -> Unit,
) {
    if (viewModel.currentUser == null) {
        LaunchedEffect(Unit) { viewModel.screen = CommunityScreen.PROFILE }
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Burgundy) }
        return
    }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val serverClientId = stringResource(R.string.default_web_client_id)
    var switching by rememberSaveable { mutableStateOf(false) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(18.dp, 20.dp, 18.dp, 32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            SectionHeader(
                tr(arabic, "ACCOUNT & COMMUNITY", "الحساب والمجتمع"),
                tr(arabic, "Settings", "الإعدادات"),
                tr(arabic, "Manage your spaces, connections, and signed-in account from one place.", "أدر مساحاتك واتصالاتك والحساب المسجّل من مكان واحد."),
            )
        }
        item {
            SettingsActionRow("◇", tr(arabic, "Manage my spaces", "إدارة مساحاتي"), tr(arabic, "Create and edit spaces you own", "أنشئ وعدّل المساحات التي تملكها")) {
                viewModel.ownedSpacesOnly = true
                viewModel.screen = CommunityScreen.SPACES
            }
        }
        item {
            SettingsActionRow("◉", tr(arabic, "Manage connections", "إدارة الاتصالات"), tr(arabic, "Review connected people and spaces", "راجع الأشخاص والمساحات المتصل بها")) {
                viewModel.screen = CommunityScreen.CONNECTIONS
            }
        }
        item {
            SettingsActionRow("↶", tr(arabic, "Unavailable-space posts", "منشورات المساحات غير المتاحة"), tr(arabic, "Review eligible archived originals and repost a new copy to the main thread", "راجع النسخ المؤرشفة المؤهلة وأعد نشر نسخة جديدة في المسار الرئيسي")) {
                viewModel.screen = CommunityScreen.ARCHIVED
            }
        }
        item {
            SettingsActionRow(
                "♢",
                tr(arabic, "Native notifications", "إشعارات الجهاز"),
                tr(
                    arabic,
                    if (nativeNotificationsEnabled) "Enabled · manage Android notification settings" else "Permission required for comments, mentions, and space activity",
                    if (nativeNotificationsEnabled) "مفعّلة · إدارة إعدادات إشعارات Android" else "يلزم الإذن للتعليقات والإشارات ونشاط المساحات",
                ),
                action = onNativeNotifications,
            )
        }
        item {
            SettingsActionRow("↗", tr(arabic, "AIAS Basra website", "موقع AIAS البصرة"), tr(arabic, "Open the main website in your browser", "افتح الموقع الرئيسي في المتصفح")) {
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.aiasbsr.com/")))
            }
        }
        item { HorizontalDivider(Modifier.padding(vertical = 4.dp), color = Line) }
        item {
            SettingsActionRow("⇄", tr(arabic, if (switching) "Opening account chooser…" else "Switch account", if (switching) "جارٍ فتح اختيار الحساب…" else "تبديل الحساب"), tr(arabic, "Choose another Google account without deleting data", "اختر حساب Google آخر دون حذف البيانات"), enabled = !switching) {
                scope.launch {
                    switching = true
                    try {
                        val manager = CredentialManager.create(context)
                        runCatching { manager.clearCredentialState(ClearCredentialStateRequest()) }
                        val option = GetSignInWithGoogleOption.Builder(serverClientId).build()
                        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
                        val credential = manager.getCredential(context, request).credential
                        if (credential is CustomCredential && credential.type == TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                            viewModel.signInWithGoogle(GoogleIdTokenCredential.createFrom(credential.data).idToken)
                            viewModel.screen = CommunityScreen.PROFILE
                        } else viewModel.showMessage(tr(arabic, "Google did not return an account. Please try again.", "لم يُرجع Google حساباً. يرجى المحاولة مرة أخرى."))
                    } catch (error: Exception) {
                        if (!error.javaClass.simpleName.contains("Cancellation", true)) viewModel.showMessage(tr(arabic, "Account switching could not be completed.", "تعذر إكمال تبديل الحساب."))
                    } finally { switching = false }
                }
            }
        }
        item {
            SettingsActionRow("↪", tr(arabic, "Sign out", "تسجيل الخروج"), tr(arabic, "Sign out of the community on this device", "سجّل الخروج من المجتمع على هذا الجهاز"), danger = true) {
                scope.launch {
                    runCatching { CredentialManager.create(context).clearCredentialState(ClearCredentialStateRequest()) }
                    viewModel.signOut()
                    viewModel.screen = CommunityScreen.PROFILE
                }
            }
        }
    }
}

@Composable
private fun SettingsActionRow(symbol: String, title: String, subtitle: String, enabled: Boolean = true, danger: Boolean = false, action: () -> Unit) {
    Surface(
        onClick = action,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth(),
        color = Paper,
        shape = RoundedCornerShape(17.dp),
        border = BorderStroke(1.dp, if (danger) Color(0xFFB3261E).copy(alpha = .25f) else Line),
    ) {
        Row(Modifier.padding(15.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(Modifier.size(44.dp), color = if (danger) Color(0xFFB3261E).copy(alpha = .09f) else SandLight, shape = RoundedCornerShape(13.dp)) { Box(contentAlignment = Alignment.Center) { Text(symbol, color = if (danger) Color(0xFFB3261E) else Burgundy, fontSize = 20.sp, fontWeight = FontWeight.Bold) } }
            Column(Modifier.padding(horizontal = 12.dp).weight(1f)) {
                Text(title, color = if (danger) Color(0xFFB3261E) else Ink, fontWeight = FontWeight.Bold)
                Text(subtitle, Modifier.padding(top = 2.dp), color = Muted, fontSize = 11.sp)
            }
            Text(if (LocalLayoutDirection.current == LayoutDirection.Rtl) "←" else "→", color = Muted)
        }
    }
}

@Composable
private fun AuthScreen(viewModel: CommunityViewModel, arabic: Boolean) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val serverClientId = stringResource(R.string.default_web_client_id)
    var signingIn by rememberSaveable { mutableStateOf(false) }
    var signInError by rememberSaveable { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.Center) {
        SectionHeader(tr(arabic, "COMMUNITY MEMBER", "عضو في المجتمع"), tr(arabic, "Welcome to AIAS", "مرحباً بك في AIAS"), tr(arabic, "Use your Google account to join the same AIAS Basra community as the website.", "استخدم حساب Google للانضمام إلى مجتمع AIAS البصرة نفسه على الموقع."))
        Surface(Modifier.align(Alignment.CenterHorizontally).padding(vertical = 18.dp), shape = CircleShape, color = Color.White, border = BorderStroke(1.dp, Line)) {
            Image(painterResource(R.drawable.aias_logo), "AIAS Basra", Modifier.size(104.dp), contentScale = ContentScale.Crop)
        }
        Button(
            onClick = {
                scope.launch {
                    signingIn = true
                    signInError = null
                    try {
                        val option = GetSignInWithGoogleOption.Builder(serverClientId).build()
                        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
                        val credential = CredentialManager.create(context).getCredential(context, request).credential
                        if (credential is CustomCredential && credential.type == TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                            viewModel.signInWithGoogle(GoogleIdTokenCredential.createFrom(credential.data).idToken)
                        } else {
                            signInError = tr(arabic, "Google did not return an account. Please try again.", "لم يُرجع Google حساباً. يرجى المحاولة مرة أخرى.")
                            viewModel.showMessage(signInError.orEmpty())
                        }
                    } catch (error: Exception) {
                        val detail = error.localizedMessage.orEmpty()
                        signInError = when {
                            detail.contains("cancel", ignoreCase = true) -> tr(arabic, "Google sign-in was closed. Tap the button to try again.", "تم إغلاق تسجيل الدخول إلى Google. اضغط على الزر للمحاولة مرة أخرى.")
                            detail.contains("developer", ignoreCase = true) || detail.contains("configuration", ignoreCase = true) -> tr(arabic, "Google login is not configured for this Android build. Add the app SHA fingerprints in Firebase, then install the updated configuration.", "لم يتم إعداد تسجيل Google لهذا الإصدار من Android. أضف بصمات SHA في Firebase ثم ثبّت الإعدادات المحدّثة.")
                            else -> detail.ifBlank { tr(arabic, "Google sign-in could not start. Check Google Play services and try again.", "تعذر بدء تسجيل الدخول إلى Google. تحقق من خدمات Google Play وحاول مرة أخرى.") }
                        }
                        viewModel.showMessage(signInError.orEmpty())
                    } finally {
                        signingIn = false
                    }
                }
            },
            Modifier.fillMaxWidth().height(54.dp),
            enabled = !signingIn,
            colors = ButtonDefaults.buttonColors(containerColor = Burgundy),
            shape = RoundedCornerShape(14.dp),
        ) {
            if (signingIn) {
                CircularProgressIndicator(Modifier.size(22.dp), color = Color.White, strokeWidth = 2.dp)
                Text(tr(arabic, "Opening Google…", "جارٍ فتح Google…"), Modifier.padding(start = 10.dp), fontWeight = FontWeight.Bold)
            } else Text(tr(arabic, "Continue with Google", "المتابعة باستخدام Google"), fontWeight = FontWeight.Bold)
        }
        signInError?.let { error ->
            Surface(Modifier.fillMaxWidth().padding(top = 12.dp), color = Color(0xFFFFF1F0), shape = RoundedCornerShape(12.dp), border = BorderStroke(1.dp, Color(0xFFE9B4AE))) {
                Text(error, Modifier.padding(12.dp), color = Color(0xFF8D241F), fontSize = 12.sp, lineHeight = 18.sp)
            }
        }
        Text(tr(arabic, "Google account sign-in is the only login method.", "تسجيل الدخول بحساب Google هو الطريقة الوحيدة."), Modifier.fillMaxWidth().padding(top = 12.dp), color = Muted, fontSize = 12.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }
}

@Composable
private fun CompleteGoogleProfileScreen(viewModel: CommunityViewModel, profile: Member, arabic: Boolean) {
    var name by rememberSaveable(profile.uid) { mutableStateOf(profile.displayName) }
    var username by rememberSaveable(profile.uid) { mutableStateOf(profile.username) }
    var school by rememberSaveable(profile.uid) { mutableStateOf(profile.school) }
    var city by rememberSaveable(profile.uid) { mutableStateOf(profile.city) }
    var bio by rememberSaveable(profile.uid) { mutableStateOf(profile.bio) }
    var usernameState by remember(profile.uid) { mutableStateOf(AvailabilityState.IDLE) }
    val usernameValid = username.matches(Regex("^[a-z0-9_]{3,24}$"))
    LaunchedEffect(username) {
        if (!usernameValid) {
            usernameState = if (username.isBlank()) AvailabilityState.IDLE else AvailabilityState.INVALID
            return@LaunchedEffect
        }
        val checked = username
        usernameState = AvailabilityState.CHECKING
        delay(250)
        viewModel.checkUsernameAvailability(checked) { available, error ->
            if (username == checked) usernameState = when {
                error != null -> AvailabilityState.ERROR
                available -> AvailabilityState.AVAILABLE
                else -> AvailabilityState.TAKEN
            }
        }
    }
    LazyColumn(Modifier.fillMaxSize().imePadding(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
        item { SectionHeader(tr(arabic, "ONE LAST STEP", "خطوة أخيرة"), tr(arabic, "Complete your profile", "أكمل ملفك الشخصي"), tr(arabic, "Choose the same community identity you want to use on the website and app.", "اختر هوية المجتمع نفسها التي تريد استخدامها على الموقع والتطبيق.")) }
        item { Avatar(name, profile.photoBase64, profile.photoUrl, 76, profile.verified) }
        item { CommunityField(name, { name = it }, tr(arabic, "Display name", "الاسم الظاهر"), tr(arabic, "Your name", "اسمك"), singleLine = true) }
        item {
            CommunityField(username, { username = it.lowercase().filter { c -> c in 'a'..'z' || c.isDigit() || c == '_' }.take(24) }, tr(arabic, "Unique username", "اسم مستخدم فريد"), "architecture_member", singleLine = true)
            AvailabilityLine(usernameState, "p/$username", arabic, username = true)
        }
        item { CommunityField(school, { school = it }, tr(arabic, "School or practice", "الجامعة أو المكتب"), tr(arabic, "University of Basrah", "جامعة البصرة"), singleLine = true) }
        item { CommunityField(city, { city = it }, tr(arabic, "City", "المدينة"), tr(arabic, "Basra", "البصرة"), singleLine = true) }
        item { CommunityField(bio, { bio = it }, tr(arabic, "Short bio", "نبذة قصيرة"), tr(arabic, "Tell the community about yourself", "عرّف المجتمع بنفسك"), minLines = 4) }
        item {
            Button(onClick = {
                if (name.isBlank()) viewModel.showMessage(tr(arabic, "Add your display name.", "أضف اسمك الظاهر."))
                else if (usernameState != AvailabilityState.AVAILABLE) viewModel.showMessage(tr(arabic, "Choose an available username before saving your profile.", "اختر اسم مستخدم متاحاً قبل حفظ ملفك."))
                else viewModel.completeGoogleProfile(username, name, school, city, bio) { }
            }, Modifier.fillMaxWidth().height(52.dp), colors = ButtonDefaults.buttonColors(containerColor = Burgundy), shape = RoundedCornerShape(14.dp)) {
                Text(tr(arabic, "Enter the community", "الدخول إلى المجتمع"), fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun NotificationSheet(viewModel: CommunityViewModel, arabic: Boolean, onDismiss: () -> Unit, onOpen: (CommunityNotification) -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Paper, modifier = Modifier.statusBarsPadding()) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 6.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(tr(arabic, "Notifications", "الإشعارات"), Modifier.weight(1f), fontFamily = MaterialTheme.typography.titleLarge.fontFamily, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                TextButton(onClick = viewModel::markAllNotificationsRead, enabled = viewModel.unreadNotifications > 0) { Text(tr(arabic, "Mark all read", "تحديد الكل كمقروء"), fontSize = 11.sp) }
            }
            HorizontalDivider(color = Line)
            if (viewModel.notifications.isEmpty()) EmptyState("♢", tr(arabic, "No notifications yet", "لا توجد إشعارات بعد"), tr(arabic, "Community activity will appear here.", "ستظهر أنشطة المجتمع هنا."))
            else LazyColumn(Modifier.fillMaxWidth().height(500.dp)) {
                items(viewModel.notifications, key = { it.id }) { item ->
                    val symbol = when { item.type.startsWith("moderation_") -> "!"; item.type == "connection" -> "◎"; item.type == "space_connection" -> "#"; item.type == "space_message" -> "✉"; item.type == "reply" -> "↩"; item.type == "applause" -> "✦"; else -> "◯" }
                    val action = when (item.type) {
                        "moderation_flagged" -> tr(arabic, "Your content was flagged", "تم تعليم محتواك")
                        "moderation_cleared" -> tr(arabic, "Your content was cleared", "تمت إزالة العلامة عن محتواك")
                        "moderation_warned" -> tr(arabic, "Your content received a warning", "تلقى محتواك تحذيراً")
                        "moderation_archived" -> tr(arabic, "Your content was archived", "تمت أرشفة محتواك")
                        "moderation_restored" -> tr(arabic, "Your content was restored", "تمت استعادة محتواك")
                        "moderation_permanently_deleted" -> tr(arabic, "Your content was permanently deleted", "تم حذف محتواك نهائياً")
                        "connection" -> tr(arabic, " connected with you", " تواصل معك")
                        "space_connection" -> tr(arabic, " connected with your space", " تواصل مع مساحتك")
                        "main_thread_access_granted" -> tr(arabic, " approved your main-thread posting access", " وافق على تصريح النشر في المسار الرئيسي")
                        "main_thread_access_denied" -> tr(arabic, " reviewed your main-thread posting request", " راجع طلب تصريح النشر في المسار الرئيسي")
                        "space_post_warned" -> tr(arabic, " warned your space post", " حذّرك بشأن منشورك في المساحة")
                        "space_post_deleted" -> tr(arabic, " deleted your space post", " حذف منشورك في المساحة")
                        "space_member_warned" -> tr(arabic, " sent you a space warning", " أرسل إليك تحذيراً في المساحة")
                        "space_member_removed" -> tr(arabic, " removed you from a space", " أزالك من المساحة")
                        "space_message" -> tr(arabic, " sent a message in a space", " أرسل رسالة في مساحة")
                        "space_chat_removed" -> tr(arabic, " removed you from a space chat", " أزالك من دردشة المساحة")
                        "reply" -> tr(arabic, " replied to your comment", " ردّ على تعليقك")
                        "applause" -> tr(arabic, " applauded your post", " صفّق لمنشورك")
                        else -> tr(arabic, " commented on your post", " علّق على منشورك")
                    }
                    Row(Modifier.fillMaxWidth().background(if (item.read) Color.Transparent else SandLight).clickable { onOpen(item) }.padding(vertical = 13.dp, horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Surface(color = Burgundy.copy(alpha = .09f), shape = CircleShape, modifier = Modifier.size(40.dp)) { Box(contentAlignment = Alignment.Center) { Text(symbol, color = Burgundy, fontWeight = FontWeight.Bold) } }
                        Column(Modifier.padding(horizontal = 10.dp).weight(1f)) {
                            val isModeration = item.type.startsWith("moderation_") || item.type.startsWith("space_post_") || item.type.startsWith("space_member_")
                            Text(if (isModeration) action else item.actorName + action, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                            Text(if (isModeration) item.reason + if (item.eligibleToRepost) tr(arabic, " · Eligible to repost", " · مؤهل لإعادة النشر") else "" else "${item.postTitle} · ${relativeTime(item.createdAt, arabic)}", color = Muted, fontSize = 10.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                        if (!item.read) Box(Modifier.size(7.dp).background(Burgundy, CircleShape))
                    }
                    HorizontalDivider(color = Line)
                }
            }
        }
    }
}

@Composable
private fun ConnectionsScreen(viewModel: CommunityViewModel, arabic: Boolean) {
    if (viewModel.currentUser == null) {
        EmptyState("◎", tr(arabic, "Sign in to manage connections", "سجّل الدخول لإدارة التواصلات"), tr(arabic, "Your connected people and spaces will appear here.", "سيظهر الأشخاص والمساحات المتصل بها هنا."))
        return
    }
    var peopleTab by rememberSaveable { mutableStateOf(true) }
    var query by rememberSaveable { mutableStateOf("") }
    var disconnectingSpace by remember { mutableStateOf<CommunitySpace?>(null) }
    val people = viewModel.connectedUsers.mapNotNull(viewModel.members::get).filter { member -> listOf(member.displayName, member.username, member.school, member.city, member.bio).any { it.contains(query, true) } }.sortedBy { it.displayName.lowercase() }
    val spaces = viewModel.spaces.filter { it.slug in viewModel.connectedSpaces && listOf(it.slug, it.name, it.description).any { value -> value.contains(query, true) } }.sortedBy { it.name.lowercase() }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 18.dp, 16.dp, 28.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { SectionHeader(tr(arabic, "YOUR COMMUNITY CIRCLE", "دائرتك المجتمعية"), tr(arabic, "Manage connections", "إدارة التواصلات"), tr(arabic, "See and manage every person and space you connect with.", "شاهد وأدر كل شخص ومساحة تتواصل معها.")) }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                ConnectionStat(viewModel.connectedUsers.size, tr(arabic, "people", "أشخاص"), Modifier.weight(1f))
                ConnectionStat(viewModel.connectedSpaces.size, tr(arabic, "spaces", "مساحات"), Modifier.weight(1f))
            }
        }
        item {
            Row(Modifier.fillMaxWidth().background(Color(0xFFF4EFEA), RoundedCornerShape(13.dp)).padding(4.dp)) {
                ConnectionTab(tr(arabic, "People", "الأشخاص"), viewModel.connectedUsers.size, peopleTab, Modifier.weight(1f)) { peopleTab = true; query = "" }
                ConnectionTab(tr(arabic, "Spaces", "المساحات"), viewModel.connectedSpaces.size, !peopleTab, Modifier.weight(1f)) { peopleTab = false; query = "" }
            }
            OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth().padding(top = 8.dp), placeholder = { Text(tr(arabic, "Search your connections", "ابحث في تواصلاتك")) }, leadingIcon = { Text("⌕") }, singleLine = true, shape = RoundedCornerShape(13.dp))
        }
        if (peopleTab) {
            if (people.isEmpty()) item { EmptyState("◎", tr(arabic, "No people connected yet", "لا يوجد أشخاص متصلون بعد"), tr(arabic, "Use Discover to find community members.", "استخدم اكتشف للعثور على أعضاء المجتمع.")) }
            items(people, key = { it.uid }) { member ->
                ConnectionPersonRow(member, arabic) { viewModel.disconnectUser(member.uid) }
            }
        } else {
            if (spaces.isEmpty()) item { EmptyState("#", tr(arabic, "No spaces connected yet", "لا توجد مساحات متصلة بعد"), tr(arabic, "Explore Spaces to find focused conversations.", "استكشف المساحات للعثور على حوارات متخصصة.")) }
            items(spaces, key = { it.slug }) { space ->
                ConnectionSpaceRow(space, arabic, onOpen = { viewModel.selectedSpace = space.slug; viewModel.screen = CommunityScreen.HOME }, onDisconnect = { disconnectingSpace = space })
            }
        }
    }
    disconnectingSpace?.let { space ->
        DisconnectSpaceDialog(space, arabic, onDismiss = { disconnectingSpace = null }) {
            disconnectingSpace = null
            viewModel.disconnectSpace(space)
        }
    }
}

@Composable private fun ConnectionStat(count: Int, label: String, modifier: Modifier) = Surface(modifier, color = Paper, shape = RoundedCornerShape(16.dp), border = BorderStroke(1.dp, Line)) { Column(Modifier.padding(15.dp)) { Text(count.toString(), color = Burgundy, fontSize = 24.sp, fontWeight = FontWeight.Bold); Text(label, color = Muted, fontSize = 11.sp) } }
@Composable private fun ConnectionTab(label: String, count: Int, active: Boolean, modifier: Modifier, action: () -> Unit) = Surface(onClick = action, modifier = modifier, color = if (active) Burgundy else Color.Transparent, contentColor = if (active) Color.White else Muted, shape = RoundedCornerShape(10.dp)) { Text("$label  $count", Modifier.padding(vertical = 11.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center, fontWeight = FontWeight.Bold, fontSize = 12.sp) }

@Composable private fun ManagementTab(label: String, active: Boolean, modifier: Modifier, action: () -> Unit) = Surface(onClick = action, modifier = modifier, color = if (active) Burgundy else Color.Transparent, contentColor = if (active) Color.White else Muted, shape = RoundedCornerShape(10.dp), border = if (active) null else BorderStroke(1.dp, Line)) { Text(label, Modifier.padding(vertical = 10.dp, horizontal = 6.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center, fontWeight = FontWeight.Bold, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }

@Composable
private fun ConnectionPersonRow(member: Member, arabic: Boolean, onDisconnect: () -> Unit) {
    Surface(color = Paper, shape = RoundedCornerShape(16.dp), border = BorderStroke(1.dp, Line)) { Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) { Avatar(member.displayName, member.photoBase64, member.photoUrl, 48, member.verified); Column(Modifier.padding(horizontal = 10.dp).weight(1f)) { Text(member.displayName, fontWeight = FontWeight.Bold); Text(if (member.username.isBlank()) tr(arabic, "Community member", "عضو في المجتمع") else "@${member.username}", color = Burgundy, fontSize = 11.sp); Text(member.bio.ifBlank { listOf(member.school, member.city).filter { it.isNotBlank() }.joinToString(" · ") }, color = Muted, fontSize = 10.sp, maxLines = 1) }; OutlinedButton(onClick = onDisconnect, contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp), shape = RoundedCornerShape(10.dp)) { Text(tr(arabic, "Disconnect", "إلغاء التواصل"), fontSize = 10.sp) } } }
}

@Composable
private fun ConnectionSpaceRow(space: CommunitySpace, arabic: Boolean, onOpen: () -> Unit, onDisconnect: () -> Unit) {
    Surface(color = Paper, shape = RoundedCornerShape(16.dp), border = BorderStroke(1.dp, Line)) { Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(48.dp).clip(RoundedCornerShape(13.dp)).background(Burgundy), contentAlignment = Alignment.Center) { if (space.imageBase64.isNotBlank()) FirebaseImage(space.imageBase64, "", Modifier.fillMaxSize(), ContentScale.Crop) else Text(space.symbol, color = Gold, fontWeight = FontWeight.Bold) }; Column(Modifier.padding(horizontal = 10.dp).weight(1f).clickable(onClick = onOpen)) { Text(space.name, fontWeight = FontWeight.Bold); Text("a/${space.slug}", color = Burgundy, fontSize = 11.sp); Text(space.description, color = Muted, fontSize = 10.sp, maxLines = 1) }; OutlinedButton(onClick = onDisconnect, contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp), shape = RoundedCornerShape(10.dp)) { Text(tr(arabic, "Disconnect", "إلغاء التواصل"), fontSize = 10.sp) } } }
}

@Composable
private fun EditPostDialog(post: CommunityPost, viewModel: CommunityViewModel, arabic: Boolean, dismiss: () -> Unit) {
    var title by rememberSaveable(post.id) { mutableStateOf(post.title) }
    var content by rememberSaveable(post.id) { mutableStateOf(post.content) }
    var behance by rememberSaveable(post.id) { mutableStateOf(post.behanceSrc) }
    var feedback by remember(post.id) { mutableStateOf<String?>(null) }
    var saving by remember(post.id) { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = { if (!saving) dismiss() },
        title = { Text(tr(arabic, "Edit post", "تعديل المنشور"), fontWeight = FontWeight.ExtraBold) },
        text = {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                feedback?.let { message -> item { InlineFormFeedback(message, error = true) } }
                item { CommunityField(title, { title = it.take(160); feedback = null }, tr(arabic, "Title", "العنوان"), "", singleLine = true) }
                item { CommunityField(content, { content = it.take(2000); feedback = null }, tr(arabic, "Content", "المحتوى"), "", minLines = 5) }
                if (post.type == "behance") item { CommunityField(behance, { behance = it; feedback = null }, tr(arabic, "Behance embed link", "رابط تضمين Behance"), "https://www.behance.net/embed/project/…", singleLine = true) }
                if (post.imageDataUrls.isNotEmpty()) item { Text(tr(arabic, "Existing post images are preserved.", "سيتم الاحتفاظ بصور المنشور الحالية."), color = Muted, fontSize = 11.sp) }
            }
        },
        confirmButton = { Button(onClick = {
            feedback = when {
                title.trim().isEmpty() -> tr(arabic, "Add a post title.", "أضف عنواناً للمنشور.")
                content.trim().isEmpty() -> tr(arabic, "Add post content.", "أضف محتوى المنشور.")
                post.type == "behance" && !behance.trim().matches(Regex("https://(www\\.)?behance\\.net/embed/project/.*")) -> tr(arabic, "Add a valid Behance embed link.", "أضف رابط تضمين Behance صالحاً.")
                else -> null
            }
            if (feedback == null) {
                saving = true
                viewModel.updatePost(post, title, content, behance) { updated ->
                    saving = false
                    if (updated) dismiss() else feedback = tr(arabic, "The post could not be updated. Please try again.", "تعذر تحديث المنشور. حاول مرة أخرى.")
                }
            }
        }, enabled = !saving, colors = ButtonDefaults.buttonColors(containerColor = Burgundy)) { Text(tr(arabic, if (saving) "Saving…" else "Save", if (saving) "جارٍ الحفظ…" else "حفظ")) } },
        dismissButton = { TextButton(onClick = dismiss, enabled = !saving) { Text(tr(arabic, "Cancel", "إلغاء")) } },
        containerColor = Paper,
    )
}

@Composable
private fun DeletePostDialog(post: CommunityPost, viewModel: CommunityViewModel, arabic: Boolean, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(tr(arabic, "Delete this post?", "حذف هذا المنشور؟"), fontWeight = FontWeight.ExtraBold) },
        text = { Text(tr(arabic, "The post, its images, comments, and reactions will be permanently deleted. This cannot be undone.", "سيتم حذف المنشور وصوره وتعليقاته وتفاعلاته نهائياً. لا يمكن التراجع عن ذلك.")) },
        confirmButton = { TextButton(onClick = onConfirm) { Text(tr(arabic, "Delete post", "حذف المنشور"), color = Color(0xFFB3261E), fontWeight = FontWeight.Bold) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(tr(arabic, "Cancel", "إلغاء")) } },
        containerColor = Paper,
    )
}

@Composable
private fun InlineFormFeedback(message: String, error: Boolean) {
    Surface(
        Modifier.fillMaxWidth(),
        color = if (error) Color(0xFFFFEDEA) else Color(0xFFEAF6EE),
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, if (error) Color(0xFFE7AAA3) else Color(0xFFA8D5B5)),
    ) {
        Text(message, Modifier.padding(11.dp), color = if (error) Color(0xFF8D241F) else Color(0xFF22643A), fontSize = 11.sp, lineHeight = 16.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun FullScreenPostDialog(post: CommunityPost, viewModel: CommunityViewModel, arabic: Boolean, returnToProfile: Boolean, onBack: () -> Unit, onComments: () -> Unit, onMember: (Member) -> Unit = {}, onSpace: (String) -> Unit, onEdit: (() -> Unit)? = null, onDelete: (() -> Unit)? = null) {
    Dialog(
        onDismissRequest = onBack,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        Surface(Modifier.fillMaxSize(), color = Cream) {
            Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
                Surface(color = Paper, shadowElevation = 2.dp) {
                    Row(
                        Modifier.fillMaxWidth().height(62.dp).padding(horizontal = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        TextButton(onClick = onBack, modifier = Modifier.height(48.dp)) {
                            Text(if (LocalLayoutDirection.current == LayoutDirection.Rtl) "→" else "←", color = Burgundy, fontSize = 25.sp, fontWeight = FontWeight.Bold)
                            Text(
                                if (returnToProfile) tr(arabic, "Profile", "الملف الشخصي") else tr(arabic, "Back", "رجوع"),
                                Modifier.padding(horizontal = 5.dp),
                                color = Burgundy,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                        Text(
                            tr(arabic, "Post", "المنشور"),
                            Modifier.weight(1f),
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            fontFamily = MaterialTheme.typography.titleLarge.fontFamily,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.ExtraBold,
                        )
                        if (post.userId == viewModel.currentUser?.uid && onEdit != null && onDelete != null) {
                            TextButton(onClick = onEdit) { Text(tr(arabic, "Edit", "تعديل"), color = Burgundy, fontSize = 11.sp) }
                            TextButton(onClick = onDelete) { Text(tr(arabic, "Delete", "حذف"), color = Color(0xFFB3261E), fontSize = 11.sp) }
                        } else Spacer(Modifier.width(82.dp))
                    }
                }
                LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 14.dp),
                ) {
                    item {
                PostCard(
                            post = post,
                            space = viewModel.spaces.firstOrNull { it.slug == post.communitySlug },
                            member = viewModel.members[post.userId],
                            members = viewModel.members,
                            arabic = arabic,
                            onVote = { viewModel.vote(post, it) },
                            signedIn = viewModel.currentUser != null,
                            onComments = onComments,
                            onMember = { it?.let(onMember) },
                            onSpace = onSpace,
                            canModerate = viewModel.canManageSpace(post.communitySlug),
                            onModerate = { action, reason -> viewModel.moderateSpacePost(post, action, reason) {} },
                            chatSpaces = viewModel.chatSpaces,
                            onShareToChat = { viewModel.sharePostToChat(post, it) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MemberProfileSheet(member: Member, viewModel: CommunityViewModel, arabic: Boolean, onDismiss: () -> Unit, onPost: (CommunityPost) -> Unit) {
    var viewMode by rememberSaveable(member.uid) { mutableStateOf("grid") }
    val allPosts = viewModel.posts.filter { post ->
        post.userId == member.uid && viewModel.spaces.firstOrNull { it.slug == post.communitySlug }?.isPrivate != true
    }.sortedByDescending { it.createdAt?.seconds ?: 0L }
    val posts = if (viewMode == "grid") allPosts.filter { it.imageDataUrls.isNotEmpty() } else allPosts
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Cream, shape = RoundedCornerShape(topStart = 25.dp, topEnd = 25.dp)) {
        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            modifier = Modifier.fillMaxWidth().height(690.dp).navigationBarsPadding(),
            contentPadding = PaddingValues(14.dp, 10.dp, 14.dp, 24.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item(span = { GridItemSpan(2) }) {
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    Avatar(member.displayName, member.photoBase64, member.photoUrl, 82, member.verified)
                    Text(member.displayName, Modifier.padding(top = 12.dp), fontFamily = MaterialTheme.typography.headlineMedium.fontFamily, fontSize = 27.sp, fontWeight = FontWeight.Bold)
                    Text("@${member.username}", color = Burgundy, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    val location = listOf(member.school, member.city).filter(String::isNotBlank).joinToString(" · ")
                    if (location.isNotBlank()) Text(location, Modifier.padding(top = 6.dp), color = Muted, fontSize = 12.sp)
                    if (member.bio.isNotBlank()) Text(member.bio, Modifier.fillMaxWidth().padding(top = 18.dp), fontSize = 14.sp, lineHeight = 21.sp)
                    if (member.interests.isNotBlank()) Text(member.interests, Modifier.fillMaxWidth().padding(top = 12.dp), color = Muted, fontSize = 12.sp)
                    if (viewModel.currentUser != null && viewModel.currentUser?.uid != member.uid) Button(
                        onClick = { viewModel.toggleUserConnection(member.uid) },
                        modifier = Modifier.padding(top = 14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = if (member.uid in viewModel.connectedUsers) Clay else Burgundy),
                        shape = RoundedCornerShape(12.dp),
                    ) { Text(if (member.uid in viewModel.connectedUsers) tr(arabic, "Connected · Disconnect", "متصل · إلغاء التواصل") else tr(arabic, "Connect", "تواصل"), fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                    Row(Modifier.fillMaxWidth().padding(top = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(tr(arabic, "Posts", "المنشورات"), Modifier.weight(1f), fontSize = 20.sp, fontWeight = FontWeight.ExtraBold)
                        Text(if (viewMode == "thread") tr(arabic, "${allPosts.size} posts", "${allPosts.size} منشور") else tr(arabic, "${posts.size} image posts", "${posts.size} منشور مصور"), color = Muted, fontSize = 10.sp)
                    }
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(top = 9.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        TypeChoice(tr(arabic, "▦ Grid", "▦ شبكة الصور"), viewMode == "grid") { viewMode = "grid" }
                        TypeChoice(tr(arabic, "☰ Thread", "☰ المسار"), viewMode == "thread") { viewMode = "thread" }
                    }
                }
            }
            if (posts.isEmpty()) item(span = { GridItemSpan(2) }) { EmptyFeed(false, arabic) }
            gridItems(posts, key = { it.id }, span = { GridItemSpan(if (viewMode == "thread") 2 else 1) }) { post ->
                if (viewMode == "grid") ProfilePostTile(post, viewModel.spaces.firstOrNull { it.slug == post.communitySlug }, arabic) { onPost(post) }
                else PostCard(
                    post = post,
                    space = viewModel.spaces.firstOrNull { it.slug == post.communitySlug },
                    member = member,
                    members = viewModel.members,
                    arabic = arabic,
                    onVote = { viewModel.vote(post, it) },
                    signedIn = viewModel.currentUser != null,
                    onComments = { onPost(post) },
                    onMember = {},
                    onSpace = { slug -> onDismiss(); viewModel.selectedSpace = slug; viewModel.screen = CommunityScreen.HOME },
                    canModerate = viewModel.canManageSpace(post.communitySlug),
                    onModerate = { action, reason -> viewModel.moderateSpacePost(post, action, reason) {} },
                    chatSpaces = viewModel.chatSpaces,
                    onShareToChat = { viewModel.sharePostToChat(post, it) },
                )
            }
        }
    }
}

@Composable
private fun CommentsSheet(post: CommunityPost, viewModel: CommunityViewModel, arabic: Boolean, onDismiss: () -> Unit, onMember: (Member) -> Unit) {
    var comments by remember(post.id) { mutableStateOf<List<CommunityComment>>(emptyList()) }
    var loading by remember(post.id) { mutableStateOf(true) }
    var text by rememberSaveable(post.id) { mutableStateOf("") }
    var replyTo by remember { mutableStateOf<CommunityComment?>(null) }
    fun reload() {
        loading = true
        viewModel.comments(post) { result, error ->
            comments = result
            loading = false
            error?.let(viewModel::showMessage)
        }
    }
    LaunchedEffect(post.id) { reload() }
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Paper, modifier = Modifier.statusBarsPadding()) {
        Column(Modifier.fillMaxWidth().imePadding().padding(horizontal = 18.dp)) {
            Text(if (post.type == "question") tr(arabic, "OPEN ANSWERS", "إجابات مفتوحة") else tr(arabic, "DISCUSSION", "النقاش"), color = Burgundy, fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 1.3.sp)
            Text(post.title, Modifier.padding(top = 5.dp), fontFamily = MaterialTheme.typography.titleLarge.fontFamily, fontSize = 24.sp, fontWeight = FontWeight.Bold)
            HorizontalDivider(Modifier.padding(vertical = 14.dp), color = Line)
            Box(Modifier.fillMaxWidth().weight(1f, fill = false).height(380.dp)) {
                when {
                    loading -> CircularProgressIndicator(Modifier.align(Alignment.Center), color = Burgundy)
                    comments.isEmpty() -> EmptyState("+", tr(arabic, if (post.type == "question") "Share the first answer" else "Start the conversation", if (post.type == "question") "شارك أول إجابة" else "ابدأ الحوار"), tr(arabic, "Offer experience, a reference, or thoughtful feedback.", "شارك تجربة أو مرجعاً أو ملاحظة بنّاءة."))
                    else -> LazyColumn(Modifier.fillMaxSize()) {
                        val roots = comments.filter { it.parentId == null || comments.none { known -> known.id == it.parentId } }
                        items(roots, key = { it.id }) { root ->
                            CommentThread(
                                comment = root,
                                comments = comments,
                                members = viewModel.members,
                                depth = 0,
                                arabic = arabic,
                                currentUserId = viewModel.currentUser?.uid,
                                postOwnerId = post.userId,
                                onReply = { replyTo = it },
                                onMember = onMember,
                                onSpace = { slug -> onDismiss(); viewModel.selectedSpace = slug; viewModel.screen = CommunityScreen.HOME },
                                onEdit = { comment, updated -> viewModel.updateComment(post, comment, updated) { if (it) reload() } },
                                onDelete = { comment -> viewModel.deleteComment(post, comment) { if (it) reload() } },
                            )
                        }
                    }
                }
            }
            if (viewModel.currentUser == null) {
                TextButton(onClick = { onDismiss(); viewModel.screen = CommunityScreen.PROFILE }) { Text(tr(arabic, "Sign in to join the discussion.", "سجّل الدخول للانضمام إلى النقاش."), color = Burgundy) }
            } else {
                replyTo?.let { Text("${tr(arabic, "Replying to", "الرد على")} ${it.userName}  ×", Modifier.clickable { replyTo = null }.padding(vertical = 4.dp), color = Burgundy, fontSize = 11.sp) }
                MentionSuggestions(text, viewModel.members.values.toList(), viewModel.spaces, arabic) { text = completeMention(text, it).take(2000) }
                Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = text, onValueChange = { if (it.length <= 2000) text = it }, modifier = Modifier.weight(1f), placeholder = { Text(tr(arabic, if (post.type == "question") "Write an answer…" else "Add to the conversation…", if (post.type == "question") "اكتب إجابة…" else "أضف إلى الحوار…"), fontSize = 12.sp) }, maxLines = 3, shape = RoundedCornerShape(14.dp))
                    Button(onClick = {
                        if (text.isBlank()) return@Button
                        viewModel.addComment(post, text, replyTo) { ok -> if (ok) { text = ""; replyTo = null; reload() } }
                    }, colors = ButtonDefaults.buttonColors(containerColor = Burgundy), contentPadding = PaddingValues(horizontal = 14.dp, vertical = 13.dp), shape = RoundedCornerShape(13.dp)) { Text(tr(arabic, "Post", "نشر"), fontSize = 12.sp) }
                }
            }
        }
    }
    BackHandler { onDismiss() }
}

@Composable
private fun CommentThread(
    comment: CommunityComment,
    comments: List<CommunityComment>,
    members: Map<String, Member>,
    depth: Int,
    arabic: Boolean,
    currentUserId: String?,
    postOwnerId: String,
    onReply: (CommunityComment) -> Unit,
    onMember: (Member) -> Unit,
    onSpace: (String) -> Unit,
    onEdit: (CommunityComment, String) -> Unit,
    onDelete: (CommunityComment) -> Unit,
) {
    val children = comments.filter { it.parentId == comment.id }.sortedBy { it.createdAt?.seconds ?: 0L }
    var expanded by remember(comment.id) { mutableStateOf(false) }
    var editing by remember(comment.id) { mutableStateOf(false) }
    var editText by remember(comment.id) { mutableStateOf(comment.text) }
    var confirmDelete by remember(comment.id) { mutableStateOf(false) }
    val member = members[comment.userId]
    Column(Modifier.fillMaxWidth().padding(start = (depth * 18).coerceAtMost(58).dp)) {
    Row(Modifier.fillMaxWidth().padding(bottom = if (children.isEmpty() || !expanded) 14.dp else 6.dp), verticalAlignment = Alignment.Top) {
        Box(Modifier.clickable(enabled = member != null) { member?.let(onMember) }) {
            Avatar(comment.userName, member?.photoBase64.orEmpty(), member?.photoUrl.orEmpty(), if (depth > 0) 30 else 36, member?.verified == true)
        }
        Column(Modifier.padding(horizontal = 9.dp).weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(comment.userName, Modifier.clickable(enabled = member != null) { member?.let(onMember) }, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                Text(" · ${relativeTime(comment.createdAt, arabic)}", color = Muted, fontSize = 10.sp)
                if (comment.editedAt != null) Text(" · ${tr(arabic, "Edited", "معدّل")}", color = Muted, fontSize = 9.sp)
            }
            if (editing) {
                OutlinedTextField(editText, { editText = it.take(2000) }, Modifier.fillMaxWidth().padding(top = 5.dp), maxLines = 5, shape = RoundedCornerShape(11.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = { if (editText.isNotBlank()) { editing = false; onEdit(comment, editText) } }) { Text(tr(arabic, "Save", "حفظ"), color = Burgundy, fontSize = 10.sp) }
                    TextButton(onClick = { editing = false; editText = comment.text }) { Text(tr(arabic, "Cancel", "إلغاء"), color = Muted, fontSize = 10.sp) }
                }
            } else MentionText(
                    comment.text,
                    Modifier.padding(top = 3.dp),
                    MaterialTheme.typography.bodyMedium.copy(fontSize = 13.sp, lineHeight = 18.sp),
                    onUser = { username -> members.values.firstOrNull { it.username.equals(username, true) }?.let(onMember) },
                    onSpace = onSpace,
                )
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(13.dp)) {
                Text(tr(arabic, "Reply", "رد"), Modifier.clickable { onReply(comment) }.padding(top = 5.dp), color = Burgundy, fontWeight = FontWeight.Bold, fontSize = 10.sp)
                if (children.isNotEmpty()) Text(
                    if (expanded) tr(arabic, "Hide replies", "إخفاء الردود") else tr(arabic, "Show ${children.size} ${if (children.size == 1) "reply" else "replies"}", "عرض ${children.size} رد"),
                    Modifier.clickable { expanded = !expanded }.padding(top = 5.dp), color = Burgundy, fontWeight = FontWeight.Bold, fontSize = 10.sp,
                )
                if (currentUserId == comment.userId) Text(tr(arabic, "Edit", "تعديل"), Modifier.clickable { editing = true }.padding(top = 5.dp), color = Burgundy, fontWeight = FontWeight.Bold, fontSize = 10.sp)
                if (currentUserId == comment.userId || currentUserId == postOwnerId) Text(tr(arabic, "Delete", "حذف"), Modifier.clickable { confirmDelete = true }.padding(top = 5.dp), color = Color(0xFFB3261E), fontWeight = FontWeight.Bold, fontSize = 10.sp)
            }
        }
    }
    if (expanded) children.forEach { child ->
        CommentThread(child, comments, members, depth + 1, arabic, currentUserId, postOwnerId, onReply, onMember, onSpace, onEdit, onDelete)
    }
    if (confirmDelete) AlertDialog(
        onDismissRequest = { confirmDelete = false },
        title = { Text(tr(arabic, "Delete this comment?", "حذف هذا التعليق؟"), fontWeight = FontWeight.ExtraBold) },
        text = { Text(tr(arabic, "This cannot be undone.", "لا يمكن التراجع عن هذا الإجراء.")) },
        confirmButton = { TextButton(onClick = { confirmDelete = false; onDelete(comment) }) { Text(tr(arabic, "Delete", "حذف"), color = Color(0xFFB3261E)) } },
        dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text(tr(arabic, "Cancel", "إلغاء")) } },
        containerColor = Paper,
    )
    }
}

@Composable
private fun SpaceSettingToggle(title: String, subtitle: String, checked: Boolean, enabled: Boolean, onChecked: (Boolean) -> Unit) {
    Surface(color = if (enabled) Cream else SearchSurface, shape = RoundedCornerShape(14.dp), border = BorderStroke(1.dp, Line)) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = if (enabled) Ink else Muted)
                Text(subtitle, Modifier.padding(top = 2.dp), color = Muted, fontSize = 10.sp)
            }
            Switch(checked = checked, onCheckedChange = onChecked, enabled = enabled)
        }
    }
}

@Composable
private fun CreateSpaceDialog(viewModel: CommunityViewModel, arabic: Boolean, dismiss: () -> Unit) {
    val publicAccess = viewModel.currentProfile?.mainThreadPostingAccess == true
    var name by rememberSaveable { mutableStateOf("") }
    var slug by rememberSaveable { mutableStateOf("") }
    var description by rememberSaveable { mutableStateOf("") }
    var imageBase64 by rememberSaveable { mutableStateOf("") }
    var bannerBase64 by rememberSaveable { mutableStateOf("") }
    var isPrivate by rememberSaveable { mutableStateOf(!publicAccess) }
    var isViewOnly by rememberSaveable { mutableStateOf(false) }
    var showInMainThread by rememberSaveable { mutableStateOf(publicAccess) }
    var mediaBusy by remember { mutableStateOf(0) }
    var slugState by remember { mutableStateOf(AvailabilityState.IDLE) }
    var feedback by remember { mutableStateOf<String?>(null) }
    var feedbackIsError by remember { mutableStateOf(true) }
    var creating by remember { mutableStateOf(false) }
    val validSlug = slug != "main" && slug.matches(Regex("^[a-z0-9-]{3,32}$"))
    LaunchedEffect(slug) {
        if (!validSlug) {
            slugState = when {
                slug.isBlank() -> AvailabilityState.IDLE
                slug == "main" -> AvailabilityState.TAKEN
                else -> AvailabilityState.INVALID
            }
            return@LaunchedEffect
        }
        val checked = slug
        feedback = null
        slugState = AvailabilityState.CHECKING
        delay(250)
        viewModel.checkSpaceHandleAvailability(checked) { available, error ->
            if (slug == checked) slugState = when {
                error != null -> AvailabilityState.ERROR
                available -> AvailabilityState.AVAILABLE
                else -> AvailabilityState.TAKEN
            }
        }
    }
    AlertDialog(
        onDismissRequest = dismiss,
        title = { Text(tr(arabic, "Create a space", "إنشاء مساحة"), fontFamily = MaterialTheme.typography.titleLarge.fontFamily, fontWeight = FontWeight.Bold) },
        text = {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (!publicAccess) item { InlineFormFeedback(tr(arabic, "Until an admin approves main-thread access, you can create private spaces only.", "حتى يوافق المشرف على تصريح المسار الرئيسي، يمكنك إنشاء مساحات خاصة فقط."), false) }
                feedback?.let { message -> item { InlineFormFeedback(message, feedbackIsError) } }
                item { MediaPickerField(tr(arabic, "Space image", "صورة المساحة"), imageBase64, true, arabic, { imageBase64 = it }, { mediaBusy += if (it) 1 else -1 }, viewModel::showMessage) }
                item { MediaPickerField(tr(arabic, "Space banner", "غلاف المساحة"), bannerBase64, false, arabic, { bannerBase64 = it }, { mediaBusy += if (it) 1 else -1 }, viewModel::showMessage) }
                item { CommunityField(name, { if (it.length <= 80) name = it }, tr(arabic, "Space name", "اسم المساحة"), tr(arabic, "Urban Sketching", "الرسم الحضري"), true) }
                item {
                    CommunityField(slug, { slug = normalizeSpaceInput(it).take(32) }, tr(arabic, "Unique handle", "معرّف فريد"), "urban-sketching", true)
                    AvailabilityLine(slugState, "a/$slug", arabic, username = false, reserved = slug == "main")
                }
                item { CommunityField(description, { if (it.length <= 360) description = it }, tr(arabic, "What belongs here?", "ما المحتوى المناسب هنا؟"), tr(arabic, "Describe the topic…", "صِف الموضوع…"), minLines = 4) }
                item { SpaceSettingToggle(tr(arabic, "Private space", "مساحة خاصة"), tr(arabic, "Require owner approval before members can enter", "تتطلب موافقة المالك قبل دخول الأعضاء"), isPrivate, publicAccess) { isPrivate = it; if (it) { isViewOnly = false; showInMainThread = false } } }
                item { SpaceSettingToggle(tr(arabic, "View only", "للعرض فقط"), tr(arabic, "Everyone can read, comment, and vote; approval is required to connect, post, or use Messages", "يمكن للجميع القراءة والتعليق والتصويت؛ والموافقة مطلوبة للاتصال أو النشر أو استخدام الرسائل"), isViewOnly, publicAccess) { isViewOnly = it; if (it) isPrivate = false } }
                item { SpaceSettingToggle(tr(arabic, "Main-thread posts", "منشورات المسار الرئيسي"), tr(arabic, "Show posts from this space in the main thread", "إظهار منشورات هذه المساحة في المسار الرئيسي"), showInMainThread, publicAccess && !isPrivate) { showInMainThread = it } }
            }
        },
        confirmButton = { Button(onClick = {
            feedbackIsError = true
            feedback = when {
                mediaBusy > 0 -> tr(arabic, "Wait for the images to finish preparing.", "انتظر حتى يكتمل تجهيز الصور.")
                name.trim().length < 3 -> tr(arabic, "The space name must contain at least 3 characters.", "يجب أن يحتوي اسم المساحة على 3 أحرف على الأقل.")
                description.trim().length < 10 -> tr(arabic, "The description must contain at least 10 characters.", "يجب أن يحتوي الوصف على 10 أحرف على الأقل.")
                slugState == AvailabilityState.CHECKING -> tr(arabic, "Wait while the space handle is checked.", "انتظر حتى يتم التحقق من معرّف المساحة.")
                slugState == AvailabilityState.TAKEN -> tr(arabic, "That space handle is already taken. Choose another one.", "معرّف المساحة مستخدم بالفعل. اختر معرّفاً آخر.")
                slugState != AvailabilityState.AVAILABLE -> tr(arabic, "Use 3–32 lowercase letters, numbers, or hyphens for the handle.", "استخدم من 3 إلى 32 حرفاً صغيراً أو رقماً أو شرطة في المعرّف.")
                else -> null
            }
            if (feedback == null) {
                creating = true
                feedbackIsError = false
                feedback = tr(arabic, "Creating your space…", "جارٍ إنشاء مساحتك…")
                viewModel.createSpace(name, slug, description, imageBase64, bannerBase64, isPrivate, isViewOnly, showInMainThread) { created ->
                    creating = false
                    if (created) dismiss() else {
                        feedbackIsError = true
                        feedback = tr(arabic, "The space could not be created. Check the details and try again.", "تعذر إنشاء المساحة. تحقق من التفاصيل وحاول مرة أخرى.")
                    }
                }
            }
        }, enabled = !creating, colors = ButtonDefaults.buttonColors(containerColor = Burgundy)) { Text(tr(arabic, if (creating) "Creating…" else "Create", if (creating) "جارٍ الإنشاء…" else "إنشاء")) } },
        dismissButton = { TextButton(onClick = dismiss, enabled = !creating) { Text(tr(arabic, "Cancel", "إلغاء")) } },
        containerColor = Paper,
    )
}

@Composable
private fun EditSpaceDialog(viewModel: CommunityViewModel, space: CommunitySpace, arabic: Boolean, dismiss: () -> Unit) {
    val isOwner = space.creatorId == viewModel.currentUser?.uid
    val canManage = viewModel.canManageSpace(space.slug)
    var name by remember(space.slug) { mutableStateOf(space.name) }
    var description by remember(space.slug) { mutableStateOf(space.description) }
    var imageBase64 by remember(space.slug) { mutableStateOf(space.imageBase64) }
    var bannerBase64 by remember(space.slug) { mutableStateOf(space.bannerBase64) }
    var isPrivate by remember(space.slug) { mutableStateOf(space.isPrivate) }
    var isViewOnly by remember(space.slug) { mutableStateOf(space.isViewOnly) }
    var showInMainThread by remember(space.slug) { mutableStateOf(space.showInMainThread) }
    var management by remember(space.slug) { mutableStateOf(SpaceManagement()) }
    var managementLoading by remember(space.slug) { mutableStateOf(true) }
    var removingMemberId by remember(space.slug) { mutableStateOf<String?>(null) }
    var warningMemberId by remember(space.slug) { mutableStateOf<String?>(null) }
    var warningReason by remember(space.slug) { mutableStateOf("") }
    var blockMemberId by remember(space.slug) { mutableStateOf<String?>(null) }
    var blockReason by remember(space.slug) { mutableStateOf("") }
    var managementTab by remember(space.slug) { mutableStateOf("members") }
    var openMemberMenuId by remember(space.slug) { mutableStateOf<String?>(null) }
    var confirmDelete by remember(space.slug) { mutableStateOf(false) }
    var confirmVisibilityChange by remember(space.slug) { mutableStateOf(false) }
    var deleting by remember(space.slug) { mutableStateOf(false) }
    var mediaBusy by remember { mutableStateOf(0) }
    fun reloadManagement() {
        managementLoading = true
        viewModel.loadSpaceManagement(space) { result, error -> management = result; managementLoading = false; error?.let(viewModel::showMessage) }
    }
    LaunchedEffect(space.slug) { reloadManagement() }
    val restrictedVisibilityCount = management.members.count { viewModel.members[it.userId]?.mainThreadPostingAccess != true } + if (viewModel.currentProfile?.mainThreadPostingAccess == false) 1 else 0
    val publicVisibilityBlocked = space.isPrivate && restrictedVisibilityCount > 0
    val visibilityChanged = isPrivate != space.isPrivate || isViewOnly != space.isViewOnly || showInMainThread != space.showInMainThread
    AlertDialog(
        onDismissRequest = dismiss,
        title = { Text(tr(arabic, "Edit your space", "تعديل مساحتك"), fontFamily = MaterialTheme.typography.titleLarge.fontFamily, fontWeight = FontWeight.Bold) },
        text = {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item { Text(tr(arabic, "Permanent address: a/${space.slug}", "العنوان الدائم: a/${space.slug}"), color = Burgundy, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                if (isOwner) item { MediaPickerField(tr(arabic, "Space image", "صورة المساحة"), imageBase64, true, arabic, { imageBase64 = it }, { mediaBusy += if (it) 1 else -1 }, viewModel::showMessage) }
                if (isOwner) item { MediaPickerField(tr(arabic, "Space banner", "غلاف المساحة"), bannerBase64, false, arabic, { bannerBase64 = it }, { mediaBusy += if (it) 1 else -1 }, viewModel::showMessage) }
                if (isOwner) item { CommunityField(name, { name = it.take(80) }, tr(arabic, "Space name", "اسم المساحة"), "", true, counter = "${name.length} / 80") }
                if (isOwner) item { CommunityField(description, { description = it.take(360) }, tr(arabic, "Description", "الوصف"), "", minLines = 4, counter = "${description.length} / 360") }
                if (isOwner && publicVisibilityBlocked) item { InlineFormFeedback(tr(arabic, "This space must remain private because $restrictedVisibilityCount owner/member account(s) do not have main-thread posting access. Remove them or wait for approval before making the space public.", "يجب أن تبقى هذه المساحة خاصة لأن $restrictedVisibilityCount من حسابات المالك/الأعضاء لا تملك تصريح المسار الرئيسي. أزلهم أو انتظر الموافقة قبل جعل المساحة عامة."), false) }
                if (canManage) item { SpaceSettingToggle(tr(arabic, "Private space", "مساحة خاصة"), tr(arabic, "Require approval to connect", "تتطلب الموافقة للاتصال"), isPrivate, !publicVisibilityBlocked) { isPrivate = it; if (it) { isViewOnly = false; showInMainThread = false } } }
                if (canManage) item { SpaceSettingToggle(tr(arabic, "View only", "للعرض فقط"), tr(arabic, "Public reading, comments, and votes; approval required to join, post, or use Messages", "قراءة وتعليقات وتصويت عامة؛ والموافقة مطلوبة للانضمام أو النشر أو استخدام الرسائل"), isViewOnly, true) { isViewOnly = it; if (it) isPrivate = false } }
                if (canManage) item { SpaceSettingToggle(tr(arabic, "Main-thread posts", "منشورات المسار الرئيسي"), tr(arabic, "Show posts outside this space", "إظهار منشورات هذه المساحة خارجها"), showInMainThread, !isPrivate) { showInMainThread = it } }
                if (isOwner) item {
                    Surface(color = Color(0xFFFFF3F3), shape = RoundedCornerShape(14.dp), border = BorderStroke(1.dp, Color(0xFFECC9CB))) {
                        Column(Modifier.fillMaxWidth().padding(13.dp)) {
                            Text(tr(arabic, "Delete this space", "حذف هذه المساحة"), color = Color(0xFF8F242B), fontWeight = FontWeight.ExtraBold, fontSize = 12.sp)
                            Text(tr(arabic, "The space page will be removed. Existing posts remain available in the main community feed.", "ستُحذف صفحة المساحة، وتبقى المنشورات الحالية متاحة في الخلاصة الرئيسية للمجتمع."), Modifier.padding(top = 4.dp), color = Muted, fontSize = 10.sp, lineHeight = 15.sp)
                            OutlinedButton(onClick = { confirmDelete = true }, Modifier.padding(top = 8.dp), enabled = !deleting, border = BorderStroke(1.dp, Color(0xFFC15B61))) {
                                Text(tr(arabic, "Delete space", "حذف المساحة"), color = Color(0xFF9D3036), fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
                if (viewModel.canManageSpace(space.slug) && managementTab == "members") item {
                    HorizontalDivider(Modifier.padding(vertical = 6.dp), color = Line)
                    Text(tr(arabic, "Membership requests (${management.requests.size})", "طلبات العضوية (${management.requests.size})"), fontWeight = FontWeight.ExtraBold, fontSize = 13.sp)
                    if (managementLoading) CircularProgressIndicator(Modifier.padding(12.dp).size(24.dp), color = Burgundy)
                    else if (management.requests.isEmpty()) Text(tr(arabic, "No pending requests.", "لا توجد طلبات معلقة."), Modifier.padding(vertical = 8.dp), color = Muted, fontSize = 11.sp)
                    management.requests.forEach { request ->
                        val member = viewModel.members[request.userId]
                        Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Avatar(member?.displayName ?: tr(arabic, "Member", "عضو"), member?.photoBase64.orEmpty(), member?.photoUrl.orEmpty(), 34, member?.verified == true)
                            Text(member?.displayName ?: request.userId.take(8), Modifier.padding(horizontal = 8.dp).weight(1f), fontWeight = FontWeight.Bold, fontSize = 11.sp)
                            TextButton(onClick = { viewModel.reviewSpaceRequest(space, request.userId, true) { if (it) reloadManagement() } }) { Text(tr(arabic, "Approve", "موافقة"), color = Color(0xFF287A45), fontSize = 10.sp) }
                            TextButton(onClick = { viewModel.reviewSpaceRequest(space, request.userId, false) { if (it) reloadManagement() } }) { Text(tr(arabic, "Deny", "رفض"), color = Color(0xFFB3261E), fontSize = 10.sp) }
                        }
                    }
                }
                if (canManage) item {
                    Text(tr(arabic, "Space access", "الوصول إلى المساحة"), fontWeight = FontWeight.ExtraBold, fontSize = 13.sp)
                    Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        ManagementTab(tr(arabic, "Manage members", "إدارة الأعضاء"), managementTab == "members", Modifier.weight(1f)) { managementTab = "members" }
                        ManagementTab(tr(arabic, "Blocked users (${management.blockedUsers.size})", "المستخدمون المحظورون (${management.blockedUsers.size})"), managementTab == "blocked", Modifier.weight(1f)) { managementTab = "blocked" }
                    }
                }
                if (managementTab == "members") item {
                    Text(tr(arabic, "All space members (${management.members.size})", "كل أعضاء المساحة (${management.members.size})"), Modifier.padding(top = 8.dp), fontWeight = FontWeight.ExtraBold, fontSize = 13.sp)
                    Text(tr(arabic, "Use the three-dot menu to manage permissions or block a member from the entire space.", "استخدم قائمة النقاط الثلاث لإدارة الصلاحيات أو حظر العضو من المساحة بالكامل."), Modifier.padding(top = 3.dp), color = Muted, fontSize = 10.sp)
                    if (!managementLoading && management.members.isEmpty()) Text(tr(arabic, "No connected members yet.", "لا يوجد أعضاء متصلون بعد."), Modifier.padding(vertical = 8.dp), color = Muted, fontSize = 11.sp)
                    management.members.forEach { item ->
                        val member = viewModel.members[item.userId]
                        val chatRequest = management.chatAccessRequests.firstOrNull { it.userId == item.userId }
                        val chatBanned = item.userId in management.chatBannedIds
                        Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Avatar(member?.displayName ?: tr(arabic, "Member", "عضو"), member?.photoBase64.orEmpty(), member?.photoUrl.orEmpty(), 34, member?.verified == true)
                            Column(Modifier.padding(horizontal = 8.dp).weight(1f)) {
                                Text(member?.displayName ?: item.userId.take(8), fontWeight = FontWeight.Bold, fontSize = 11.sp)
                                if (!member?.username.isNullOrBlank()) Text("@${member?.username}", color = Burgundy, fontSize = 9.sp)
                                if (member != null && !member.mainThreadPostingAccess) Text(tr(arabic, "No main-thread access", "لا يملك تصريح المسار الرئيسي"), color = Color(0xFFB3261E), fontSize = 8.sp, fontWeight = FontWeight.Bold)
                                if (space.chatEnabled) Text(tr(arabic, if (chatBanned) "Messages banned" else if (item.chatAccessApproved) "Messages approved" else if (chatRequest != null) "Messages request pending" else "Messages not approved", if (chatBanned) "الرسائل محظورة" else if (item.chatAccessApproved) "تمت الموافقة على الرسائل" else if (chatRequest != null) "طلب الرسائل معلق" else "لم تتم الموافقة على الرسائل"), color = if (chatBanned) Color(0xFFB3261E) else if (item.chatAccessApproved) Color(0xFF287A45) else Clay, fontSize = 8.sp, fontWeight = FontWeight.Bold)
                            }
                            Box {
                                IconButton(onClick = { openMemberMenuId = item.userId }) { Icon(Icons.Default.MoreVert, tr(arabic, "Member actions", "إجراءات العضو"), tint = Burgundy) }
                                DropdownMenu(expanded = openMemberMenuId == item.userId, onDismissRequest = { openMemberMenuId = null }) {
                                    if (isOwner) DropdownMenuItem(text = { Text(tr(arabic, if (item.userId in management.adminIds) "Remove admin" else "Make admin", if (item.userId in management.adminIds) "إزالة المشرف" else "تعيين مشرف")) }, onClick = { openMemberMenuId = null; viewModel.setSpaceAdmin(space, item.userId, item.userId !in management.adminIds) { if (it) reloadManagement() } })
                                    if (space.chatEnabled && chatBanned) DropdownMenuItem(text = { Text(tr(arabic, "Restore Messages", "استعادة الرسائل")) }, onClick = { openMemberMenuId = null; viewModel.reviewSpaceChatAccess(space, item.userId, true) { if (it) reloadManagement() } })
                                    else if (space.chatEnabled && !item.chatAccessApproved) {
                                        DropdownMenuItem(text = { Text(tr(arabic, "Grant Messages", "منح الرسائل")) }, onClick = { openMemberMenuId = null; viewModel.reviewSpaceChatAccess(space, item.userId, true) { if (it) reloadManagement() } })
                                        if (chatRequest != null) DropdownMenuItem(text = { Text(tr(arabic, "Deny request", "رفض الطلب")) }, onClick = { openMemberMenuId = null; viewModel.reviewSpaceChatAccess(space, item.userId, false) { if (it) reloadManagement() } })
                                    } else if (space.chatEnabled) DropdownMenuItem(text = { Text(tr(arabic, "Ban from Messages", "حظر من الرسائل"), color = Color(0xFFB3261E)) }, onClick = { openMemberMenuId = null; viewModel.reviewSpaceChatAccess(space, item.userId, false, ban = true) { if (it) reloadManagement() } })
                                    DropdownMenuItem(text = { Text(tr(arabic, "Warn", "تحذير")) }, onClick = { openMemberMenuId = null; warningMemberId = item.userId })
                                    DropdownMenuItem(text = { Text(tr(arabic, "Block from space", "حظر من المساحة"), color = Color(0xFFB3261E)) }, onClick = { openMemberMenuId = null; blockMemberId = item.userId })
                                    DropdownMenuItem(text = { Text(tr(arabic, "Remove member", "إزالة العضو"), color = Color(0xFFB3261E)) }, onClick = { openMemberMenuId = null; removingMemberId = item.userId })
                                }
                            }
                        }
                    }
                } else item {
                    Text(tr(arabic, "Blocked users (${management.blockedUsers.size})", "المستخدمون المحظورون (${management.blockedUsers.size})"), Modifier.padding(top = 8.dp), fontWeight = FontWeight.ExtraBold, fontSize = 13.sp)
                    Text(tr(arabic, "Blocked users cannot view this space or any of its posts, even by direct link.", "لا يستطيع المستخدمون المحظورون عرض هذه المساحة أو أي من منشوراتها حتى عبر رابط مباشر."), Modifier.padding(top = 3.dp), color = Muted, fontSize = 10.sp)
                    if (!managementLoading && management.blockedUsers.isEmpty()) Text(tr(arabic, "No blocked users.", "لا يوجد مستخدمون محظورون."), Modifier.padding(vertical = 8.dp), color = Muted, fontSize = 11.sp)
                    management.blockedUsers.forEach { blocked ->
                        val member = viewModel.members[blocked.userId]
                        Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Avatar(member?.displayName ?: tr(arabic, "Member", "عضو"), member?.photoBase64.orEmpty(), member?.photoUrl.orEmpty(), 34, member?.verified == true)
                            Column(Modifier.padding(horizontal = 8.dp).weight(1f)) {
                                Text(member?.displayName ?: blocked.userId.take(8), fontWeight = FontWeight.Bold, fontSize = 11.sp)
                                Text(blocked.reason.ifBlank { tr(arabic, "Blocked from this space", "محظور من هذه المساحة") }, color = Muted, fontSize = 9.sp)
                            }
                            TextButton(onClick = { viewModel.unblockSpaceUser(space, blocked.userId) { if (it) reloadManagement() } }) { Text(tr(arabic, "Unblock", "إلغاء الحظر"), color = Color(0xFF287A45), fontSize = 10.sp) }
                        }
                    }
                }
            }
        },
        confirmButton = {
            if (canManage) Button(onClick = {
                when {
                    isOwner && mediaBusy > 0 -> viewModel.showMessage(tr(arabic, "Wait for the images to finish preparing.", "انتظر حتى يكتمل تجهيز الصور."))
                    isOwner && (name.isBlank() || description.isBlank()) -> viewModel.showMessage(tr(arabic, "Add the space name and description.", "أضف اسم المساحة ووصفها."))
                    !isPrivate && !isViewOnly && restrictedVisibilityCount > 0 -> viewModel.showMessage(tr(arabic, "This space cannot become public while restricted members are connected. Remove them, use View only, or keep the space private.", "لا يمكن جعل هذه المساحة عامة مع وجود أعضاء لا يملكون تصريح المسار الرئيسي. أزلهم أو استخدم وضع العرض فقط أو أبقِ المساحة خاصة."))
                    visibilityChanged -> confirmVisibilityChange = true
                    isOwner -> viewModel.updateSpace(space, name, description, imageBase64, bannerBase64, isPrivate, isViewOnly, showInMainThread) { if (it) dismiss() }
                    else -> viewModel.updateSpaceVisibility(space, isPrivate, isViewOnly, showInMainThread) { if (it) dismiss() }
                }
            }, colors = ButtonDefaults.buttonColors(containerColor = Burgundy)) { Text(tr(arabic, "Save space", "حفظ المساحة")) }
            else Button(onClick = dismiss, colors = ButtonDefaults.buttonColors(containerColor = Burgundy)) { Text(tr(arabic, "Done", "تم")) }
        },
        dismissButton = { TextButton(onClick = dismiss) { Text(tr(arabic, "Cancel", "إلغاء")) } },
        containerColor = Paper,
    )
    if (confirmVisibilityChange) {
        AlertDialog(
            onDismissRequest = { confirmVisibilityChange = false },
            title = { Text(tr(arabic, "Confirm space access change", "تأكيد تغيير وصول المساحة"), fontWeight = FontWeight.ExtraBold) },
            text = { Text(tr(arabic, "Changing private, view-only, or main-thread visibility changes who can access this space. Apply this server-managed change?", "تغيير الخصوصية أو العرض فقط أو ظهور المسار الرئيسي يغيّر من يمكنه الوصول إلى هذه المساحة. هل تريد تطبيق التغيير الذي يديره الخادم؟")) },
            confirmButton = { TextButton(onClick = {
                confirmVisibilityChange = false
                if (isOwner) viewModel.updateSpace(space, name, description, imageBase64, bannerBase64, isPrivate, isViewOnly, showInMainThread) { if (it) dismiss() }
                else viewModel.updateSpaceVisibility(space, isPrivate, isViewOnly, showInMainThread) { if (it) dismiss() }
            }) { Text(tr(arabic, "Apply change", "تطبيق التغيير"), color = Burgundy, fontWeight = FontWeight.Bold) } },
            dismissButton = { TextButton(onClick = { confirmVisibilityChange = false }) { Text(tr(arabic, "Cancel", "إلغاء")) } },
            containerColor = Paper,
        )
    }
    removingMemberId?.let { userId ->
        val member = viewModel.members[userId]
        AlertDialog(
            onDismissRequest = { removingMemberId = null },
            title = { Text(tr(arabic, "Remove space member?", "إزالة عضو المساحة؟"), fontWeight = FontWeight.ExtraBold) },
            text = { Text(tr(arabic, "${member?.displayName ?: "This member"} will lose access immediately and all of their posts in a/${space.slug} will be permanently deleted.", "سيفقد ${member?.displayName ?: "هذا العضو"} الوصول فوراً وستُحذف جميع منشوراته في a/${space.slug} نهائياً.")) },
            confirmButton = { TextButton(onClick = { removingMemberId = null; viewModel.removeSpaceMember(space, userId) { if (it) reloadManagement() } }) { Text(tr(arabic, "Remove access and posts", "إزالة الوصول والمنشورات"), color = Color(0xFFB3261E), fontWeight = FontWeight.Bold) } },
            dismissButton = { TextButton(onClick = { removingMemberId = null }) { Text(tr(arabic, "Cancel", "إلغاء")) } },
            containerColor = Paper,
        )
    }
    warningMemberId?.let { userId ->
        AlertDialog(
            onDismissRequest = { warningMemberId = null; warningReason = "" },
            title = { Text(tr(arabic, "Warn space member", "تحذير عضو المساحة"), fontWeight = FontWeight.ExtraBold) },
            text = { OutlinedTextField(warningReason, { warningReason = it.take(500) }, Modifier.fillMaxWidth(), label = { Text(tr(arabic, "Reason (required)", "السبب (مطلوب)")) }, minLines = 3) },
            confirmButton = { TextButton(onClick = { val reason = warningReason.trim(); warningMemberId = null; warningReason = ""; viewModel.warnSpaceMember(space, userId, reason) {} }, enabled = warningReason.trim().length >= 3) { Text(tr(arabic, "Send warning", "إرسال التحذير"), color = Burgundy) } },
            dismissButton = { TextButton(onClick = { warningMemberId = null; warningReason = "" }) { Text(tr(arabic, "Cancel", "إلغاء")) } },
            containerColor = Paper,
        )
    }
    blockMemberId?.let { userId ->
        AlertDialog(
            onDismissRequest = { blockMemberId = null; blockReason = "" },
            title = { Text(tr(arabic, "Block user from space?", "حظر المستخدم من المساحة؟"), fontWeight = FontWeight.ExtraBold) },
            text = { Column { Text(tr(arabic, "They will lose membership and cannot view this space or its posts, even through a direct link.", "سيفقد العضوية ولن يتمكن من عرض هذه المساحة أو منشوراتها حتى عبر رابط مباشر."), color = Muted, fontSize = 12.sp); OutlinedTextField(blockReason, { blockReason = it.take(500) }, Modifier.fillMaxWidth().padding(top = 12.dp), label = { Text(tr(arabic, "Reason (required)", "السبب (مطلوب)")) }, minLines = 3) } },
            confirmButton = { TextButton(onClick = { val reason = blockReason.trim(); viewModel.blockSpaceUser(space, userId, reason) { if (it) { blockMemberId = null; blockReason = ""; reloadManagement() } } }, enabled = blockReason.trim().length >= 3) { Text(tr(arabic, "Block from space", "حظر من المساحة"), color = Color(0xFFB3261E)) } },
            dismissButton = { TextButton(onClick = { blockMemberId = null; blockReason = "" }) { Text(tr(arabic, "Cancel", "إلغاء")) } },
            containerColor = Paper,
        )
    }
    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { if (!deleting) confirmDelete = false },
            title = { Text(tr(arabic, "Delete a/${space.slug}?", "حذف a/${space.slug}؟"), fontWeight = FontWeight.ExtraBold) },
            text = { Text(tr(arabic, "This removes the space page permanently. Existing posts remain in the main feed.", "سيؤدي هذا إلى حذف صفحة المساحة نهائياً. ستبقى المنشورات الحالية في الخلاصة الرئيسية.")) },
            confirmButton = {
                TextButton(onClick = {
                    deleting = true
                    viewModel.deleteSpace(space) { success ->
                        deleting = false
                        confirmDelete = false
                        if (success) dismiss()
                    }
                }, enabled = !deleting) { Text(tr(arabic, if (deleting) "Deleting…" else "Delete permanently", if (deleting) "جارٍ الحذف…" else "حذف نهائي"), color = Color(0xFFB3261E), fontWeight = FontWeight.Bold) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }, enabled = !deleting) { Text(tr(arabic, "Cancel", "إلغاء")) } },
            containerColor = Paper,
        )
    }
}

@Composable
private fun EditProfileDialog(viewModel: CommunityViewModel, profile: Member?, arabic: Boolean, dismiss: () -> Unit) {
    var name by remember(profile) { mutableStateOf(profile?.displayName.orEmpty()) }
    var school by remember(profile) { mutableStateOf(profile?.school.orEmpty()) }
    var city by remember(profile) { mutableStateOf(profile?.city.orEmpty()) }
    var bio by remember(profile) { mutableStateOf(profile?.bio.orEmpty()) }
    var interests by remember(profile) { mutableStateOf(profile?.interests.orEmpty()) }
    var photoBase64 by remember(profile) { mutableStateOf(profile?.photoBase64.orEmpty().ifBlank { profile?.photoUrl.orEmpty() }) }
    var bannerBase64 by remember(profile) { mutableStateOf(profile?.bannerBase64.orEmpty()) }
    var mediaBusy by remember { mutableStateOf(0) }
    AlertDialog(
        onDismissRequest = dismiss,
        title = { Text(tr(arabic, "Edit profile", "تعديل الملف الشخصي"), fontFamily = MaterialTheme.typography.titleLarge.fontFamily, fontWeight = FontWeight.Bold) },
        text = {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item { MediaPickerField(tr(arabic, "Profile image", "صورة الملف الشخصي"), photoBase64, true, arabic, { photoBase64 = it }, { mediaBusy += if (it) 1 else -1 }, viewModel::showMessage) }
                item { MediaPickerField(tr(arabic, "Profile banner", "غلاف الملف الشخصي"), bannerBase64, false, arabic, { bannerBase64 = it }, { mediaBusy += if (it) 1 else -1 }, viewModel::showMessage) }
                item { CommunityField(name, { name = it.take(100) }, tr(arabic, "Display name", "الاسم الظاهر"), "", true) }
                if (!profile?.username.isNullOrBlank()) item {
                    OutlinedTextField(value = profile.username, onValueChange = {}, modifier = Modifier.fillMaxWidth(), readOnly = true, label = { Text(tr(arabic, "Unique username", "اسم مستخدم فريد")) }, shape = RoundedCornerShape(13.dp))
                    Text(tr(arabic, "Your permanent profile address is p/${profile.username}", "عنوان ملفك الدائم هو p/${profile.username}"), Modifier.padding(top = 4.dp), color = Color(0xFF287A45), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
                item { CommunityField(school, { school = it.take(120) }, tr(arabic, "School", "الجامعة"), "", true) }
                item { CommunityField(city, { city = it.take(80) }, tr(arabic, "City", "المدينة"), "", true) }
                item { CommunityField(bio, { bio = it.take(360) }, tr(arabic, "Bio", "نبذة"), "", minLines = 3) }
                item { CommunityField(interests, { interests = it.take(240) }, tr(arabic, "Interests", "الاهتمامات"), "", minLines = 2) }
            }
        },
        confirmButton = { Button(onClick = {
            when {
                mediaBusy > 0 -> viewModel.showMessage(tr(arabic, "Wait for the images to finish preparing.", "انتظر حتى يكتمل تجهيز الصور."))
                name.isBlank() -> viewModel.showMessage(tr(arabic, "Add your display name.", "أضف اسمك الظاهر."))
                else -> viewModel.updateProfile(name, school, city, bio, interests, photoBase64, bannerBase64) { if (it) dismiss() }
            }
        }, colors = ButtonDefaults.buttonColors(containerColor = Burgundy)) { Text(tr(arabic, "Save", "حفظ")) } },
        dismissButton = { TextButton(onClick = dismiss) { Text(tr(arabic, "Cancel", "إلغاء")) } },
        containerColor = Paper,
    )
}

@Composable
private fun AvailabilityLine(state: AvailabilityState, route: String, arabic: Boolean, username: Boolean, reserved: Boolean = false) {
    val (text, color) = when (state) {
        AvailabilityState.IDLE -> tr(
            arabic,
            if (username) "Use 3–24 lowercase letters, numbers, or underscores." else "Use 3–32 lowercase letters, numbers, or hyphens.",
            if (username) "استخدم من 3 إلى 24 حرفاً إنجليزياً صغيراً أو رقماً أو شرطة سفلية." else "استخدم من 3 إلى 32 حرفاً إنجليزياً صغيراً أو رقماً أو شرطة.",
        ) to Muted
        AvailabilityState.CHECKING -> tr(arabic, "Checking $route…", "جارٍ التحقق من $route…") to Muted
        AvailabilityState.AVAILABLE -> tr(arabic, "$route is available.", "$route متاح.") to Color(0xFF287A45)
        AvailabilityState.TAKEN -> tr(
            arabic,
            if (reserved) "a/main is reserved for the main community thread." else "$route is already taken.",
            if (reserved) "المعرّف a/main محجوز للمسار الرئيسي." else "$route مستخدم بالفعل.",
        ) to Color(0xFFB3261E)
        AvailabilityState.INVALID -> tr(
            arabic,
            if (username) "Use 3–24 lowercase letters, numbers, or underscores." else "Use 3–32 lowercase letters, numbers, or hyphens.",
            if (username) "استخدم من 3 إلى 24 حرفاً إنجليزياً صغيراً أو رقماً أو شرطة سفلية." else "استخدم من 3 إلى 32 حرفاً إنجليزياً صغيراً أو رقماً أو شرطة.",
        ) to Color(0xFFB3261E)
        AvailabilityState.ERROR -> tr(
            arabic,
            if (username) "Could not check this username. Try again." else "Could not check this handle. Try again.",
            if (username) "تعذر التحقق من اسم المستخدم. حاول مجدداً." else "تعذر التحقق من هذا المعرّف. حاول مجدداً.",
        ) to Color(0xFFB3261E)
    }
    Text(text, Modifier.padding(top = 4.dp), color = color, fontSize = 11.sp, fontWeight = if (state == AvailabilityState.AVAILABLE || state == AvailabilityState.TAKEN) FontWeight.Bold else FontWeight.Normal)
}

@Composable
private fun MediaPickerField(
    label: String,
    value: String,
    avatar: Boolean,
    arabic: Boolean,
    onValue: (String) -> Unit,
    onBusy: (Boolean) -> Unit,
    onError: (String) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var preparing by remember { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) scope.launch {
            preparing = true
            onBusy(true)
            runCatching { prepareFirebaseImage(context, uri, avatar) }
                .onSuccess(onValue)
                .onFailure { onError(it.localizedMessage ?: tr(arabic, "Image could not be prepared.", "تعذر تجهيز الصورة.")) }
            preparing = false
            onBusy(false)
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, fontWeight = FontWeight.Bold, fontSize = 12.sp)
        Box(
            Modifier.fillMaxWidth().then(if (avatar) Modifier.height(120.dp) else Modifier.height(110.dp))
                .clip(RoundedCornerShape(14.dp)).background(Color(0xFFF0EBE6)).border(1.dp, Line, RoundedCornerShape(14.dp)),
            contentAlignment = Alignment.Center,
        ) {
            if (value.isNotBlank()) FirebaseImage(value, "", if (avatar) Modifier.size(104.dp).clip(CircleShape) else Modifier.fillMaxSize(), ContentScale.Crop)
            else Text(tr(arabic, if (avatar) "No image" else "No banner", if (avatar) "لا توجد صورة" else "لا يوجد غلاف"), color = Muted, fontSize = 12.sp)
            if (preparing) Box(Modifier.matchParentSize().background(Color.White.copy(alpha = .72f)), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Burgundy) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { launcher.launch("image/*") }, enabled = !preparing, contentPadding = PaddingValues(horizontal = 12.dp, vertical = 5.dp), shape = RoundedCornerShape(10.dp)) {
                Text(tr(arabic, if (value.isBlank()) "Choose image" else "Replace", if (value.isBlank()) "اختر صورة" else "استبدال"), fontSize = 11.sp)
            }
            TextButton(onClick = { onValue("") }, enabled = value.isNotBlank() && !preparing) { Text(tr(arabic, "Remove", "إزالة"), color = Burgundy, fontSize = 11.sp) }
        }
        Text(tr(arabic, if (avatar) "Square image recommended" else "Wide image recommended", if (avatar) "يُفضّل استخدام صورة مربعة" else "يُفضّل استخدام صورة عريضة"), color = Muted, fontSize = 10.sp)
    }
}

private fun normalizeSpaceInput(value: String): String = value.trim().lowercase(Locale.US)
    .replace(Regex("^/?a/"), "")
    .replace(Regex("[\\s_]+"), "-")
    .replace(Regex("[^a-z0-9-]"), "")
    .replace(Regex("-+"), "-")
    .trim('-')

private fun activeMention(value: String): String? = Regex("@(?:a/)?[A-Za-z0-9_-]*$").find(value)?.value

private fun completeMention(value: String, tag: String): String {
    val match = Regex("@(?:a/)?[A-Za-z0-9_-]*$").find(value) ?: return "$value$tag "
    return value.replaceRange(match.range, "$tag ")
}

@Composable
private fun MentionSuggestions(value: String, members: List<Member>, spaces: List<CommunitySpace>, arabic: Boolean, onSelect: (String) -> Unit) {
    val active = activeMention(value) ?: return
    val spaceMode = active.startsWith("@a/", true)
    val query = active.substringAfter(if (spaceMode) "@a/" else "@").lowercase()
    val suggestions = if (spaceMode) {
        spaces.filter { query.isBlank() || it.slug.contains(query) || it.name.contains(query, true) }.take(5).map { "@a/${it.slug}" to it.name }
    } else {
        members.filter { it.username.isNotBlank() && (query.isBlank() || it.username.contains(query) || it.displayName.contains(query, true)) }.take(5).map { "@${it.username}" to it.displayName }
    }
    if (suggestions.isEmpty()) return
    Column(Modifier.fillMaxWidth().padding(top = 5.dp).border(1.dp, Line, RoundedCornerShape(12.dp)).background(Paper)) {
        Text(tr(arabic, if (spaceMode) "TAG A SPACE" else "TAG A MEMBER", if (spaceMode) "إشارة إلى مساحة" else "إشارة إلى عضو"), Modifier.padding(horizontal = 11.dp, vertical = 6.dp), color = Muted, fontSize = 8.sp, fontWeight = FontWeight.Black, letterSpacing = .8.sp)
        suggestions.forEach { (tag, label) ->
            Row(Modifier.fillMaxWidth().clickable { onSelect(tag) }.padding(horizontal = 11.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(tag, color = Burgundy, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                Text(label, Modifier.padding(horizontal = 8.dp).weight(1f), color = Muted, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun PostImagePicker(
    images: List<String>,
    arabic: Boolean,
    onImages: (List<String>) -> Unit,
    onBusy: (Boolean) -> Unit,
    onError: (String) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        scope.launch {
            onBusy(true)
            val prepared = images.toMutableList()
            uris.take(6 - prepared.size).forEach { uri ->
                runCatching { preparePostImage(context, uri) }
                    .onSuccess { prepared += it }
                    .onFailure { onError(it.localizedMessage ?: tr(arabic, "Image could not be prepared.", "تعذر تجهيز الصورة.")) }
            }
            onImages(prepared)
            onBusy(false)
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(tr(arabic, "Image gallery (optional)", "معرض الصور (اختياري)"), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                Text(tr(arabic, "JPEG, PNG, or WebP · 10 MB each", "JPEG أو PNG أو WebP · ‏10 ميغابايت لكل صورة"), color = Muted, fontSize = 10.sp)
            }
            Text("${images.size} / 6", color = Muted, fontSize = 10.sp)
        }
        if (images.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                images.forEachIndexed { index, image ->
                    Box(Modifier.size(96.dp).clip(RoundedCornerShape(12.dp)).background(SearchSurface)) {
                        FirebaseImage(image, "", Modifier.fillMaxSize(), ContentScale.Crop)
                        Surface(onClick = { onImages(images.filterIndexed { i, _ -> i != index }) }, modifier = Modifier.align(Alignment.TopEnd).padding(4.dp), color = BurgundyDark.copy(alpha = .9f), shape = CircleShape) {
                            Text("×", Modifier.padding(horizontal = 7.dp, vertical = 2.dp), color = Color.White, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
        OutlinedButton(onClick = { launcher.launch("image/*") }, enabled = images.size < 6, shape = RoundedCornerShape(11.dp)) {
            Text(tr(arabic, if (images.isEmpty()) "Choose images" else "Add images", if (images.isEmpty()) "اختيار الصور" else "إضافة صور"), fontSize = 11.sp)
        }
    }
}

@Composable
private fun CommunityField(
    value: String,
    onValue: (String) -> Unit,
    label: String,
    placeholder: String,
    singleLine: Boolean = false,
    minLines: Int = 1,
    counter: String? = null,
    keyboardType: KeyboardType = KeyboardType.Text,
) {
    Column {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, fontWeight = FontWeight.Bold, fontSize = 12.sp)
            counter?.let { Text(it, color = Muted, fontSize = 10.sp) }
        }
        OutlinedTextField(
            value = value,
            onValueChange = onValue,
            modifier = Modifier.fillMaxWidth().padding(top = 5.dp),
            placeholder = { Text(placeholder, color = Muted, fontSize = 12.sp) },
            singleLine = singleLine,
            minLines = minLines,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType, imeAction = if (singleLine) ImeAction.Next else ImeAction.Default),
            shape = RoundedCornerShape(13.dp),
        )
    }
}

@Composable
private fun Avatar(name: String, dataUrl: String, imageUrl: String, size: Int, verified: Boolean = false) {
    val blue = Color(0xFF2F78C4)
    Box(
        modifier = Modifier.size((size + if (verified) 6 else 0).dp),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier.size(size.dp).clip(CircleShape).background(Burgundy.copy(alpha = .10f)).border(if (verified) 3.dp else 1.dp, if (verified) blue else Line, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(initials(name), color = Burgundy, fontWeight = FontWeight.Black, fontSize = (size * .33f).sp)
            FirebaseImage(dataUrl, imageUrl, Modifier.fillMaxSize().padding(if (verified) 3.dp else 0.dp).clip(CircleShape), ContentScale.Crop, name)
        }
        if (verified) {
            Box(
                Modifier.align(Alignment.BottomEnd).size(if (size >= 70) 24.dp else 17.dp).background(blue, CircleShape).border(2.dp, Color.White, CircleShape),
                contentAlignment = Alignment.Center,
            ) { Text("✓", color = Color.White, fontSize = if (size >= 70) 13.sp else 9.sp, fontWeight = FontWeight.Black) }
        }
    }
}

@Composable
private fun FirebaseImage(dataUrl: String, imageUrl: String, modifier: Modifier, contentScale: ContentScale, description: String? = null) {
    var image by remember(dataUrl, imageUrl) { mutableStateOf<androidx.compose.ui.graphics.ImageBitmap?>(null) }
    LaunchedEffect(dataUrl, imageUrl) {
        image = withContext(Dispatchers.IO) {
            runCatching {
                val source = dataUrl.ifBlank { imageUrl }
                if (source.startsWith("https://") || source.startsWith("http://")) {
                    val connection = URL(source).openConnection().apply {
                        connectTimeout = 12_000
                        readTimeout = 18_000
                    }
                    connection.getInputStream().use { BitmapFactory.decodeStream(it)?.asImageBitmap() }
                } else if (source.isNotBlank()) {
                    val encoded = source.substringAfter("base64,", source)
                    val bytes = Base64.decode(encoded, Base64.DEFAULT)
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
                } else null
            }.getOrNull()
        }
    }
    image?.let { Image(it, description, modifier, contentScale = contentScale) }
}

@Composable
private fun FirebaseStorageImage(path: String, modifier: Modifier, description: String? = null) {
    var image by remember(path) { mutableStateOf<androidx.compose.ui.graphics.ImageBitmap?>(null) }
    var failed by remember(path) { mutableStateOf(false) }
    LaunchedEffect(path) {
        image = null
        failed = false
        com.google.firebase.storage.FirebaseStorage.getInstance().reference.child(path).getBytes(8L * 1024 * 1024)
            .addOnSuccessListener { bytes ->
                image = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
                failed = image == null
            }
            .addOnFailureListener { failed = true }
    }
    Box(modifier.background(SearchSurface), contentAlignment = Alignment.Center) {
        when {
            image != null -> Image(image!!, description, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            failed -> Text("!", color = Muted, fontWeight = FontWeight.Bold)
            else -> CircularProgressIndicator(Modifier.size(24.dp), color = Burgundy, strokeWidth = 2.dp)
        }
    }
}

@Composable
private fun VoiceMessagePlayer(path: String, durationMs: Long, arabic: Boolean) {
    var url by remember(path) { mutableStateOf<String?>(null) }
    var player by remember(path) { mutableStateOf<MediaPlayer?>(null) }
    var playing by remember(path) { mutableStateOf(false) }
    var failed by remember(path) { mutableStateOf(false) }
    LaunchedEffect(path) {
        FirebaseStorage.getInstance().reference.child(path).downloadUrl
            .addOnSuccessListener { url = it.toString() }
            .addOnFailureListener { failed = true }
    }
    DisposableEffect(path) { onDispose { runCatching { player?.release() }; player = null } }
    Surface(Modifier.fillMaxWidth().padding(top = 8.dp), color = Burgundy.copy(alpha = .06f), shape = RoundedCornerShape(13.dp), border = BorderStroke(1.dp, Burgundy.copy(alpha = .12f))) {
        Row(Modifier.padding(9.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = {
                val readyUrl = url ?: return@TextButton
                if (playing) { player?.pause(); playing = false }
                else {
                    if (player == null) player = MediaPlayer().apply {
                        setDataSource(readyUrl)
                        setOnPreparedListener { it.start(); playing = true }
                        setOnCompletionListener { playing = false; it.seekTo(0) }
                        setOnErrorListener { _, _, _ -> failed = true; playing = false; true }
                        prepareAsync()
                    } else { player?.start(); playing = true }
                }
            }, enabled = url != null && !failed) { Text(if (playing) "■" else "▶", color = Burgundy, fontSize = 17.sp) }
            Column(Modifier.weight(1f)) {
                Text(tr(arabic, "Voice message", "رسالة صوتية"), fontWeight = FontWeight.Bold, fontSize = 11.sp)
                Text(if (failed) tr(arabic, "Audio unavailable", "الصوت غير متاح") else "${(durationMs / 1000).coerceAtLeast(1)}s", color = Muted, fontSize = 9.sp)
            }
            Text("〰", color = Clay, fontSize = 23.sp)
        }
    }
}

private suspend fun preparePostImage(context: Context, uri: Uri): String = withContext(Dispatchers.IO) {
    val resolver = context.contentResolver
    val length = resolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L
    require(length <= 10L * 1024 * 1024 || length < 0) { "Choose an image smaller than 10 MB." }
    val decoded = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        ImageDecoder.decodeBitmap(ImageDecoder.createSource(resolver, uri)) { decoder, info, _ ->
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            val largest = maxOf(info.size.width, info.size.height)
            var sample = 1
            while (largest / (sample * 2) >= 1800) sample *= 2
            decoder.setTargetSampleSize(sample)
        }
    } else resolver.openInputStream(uri)?.use(BitmapFactory::decodeStream) ?: error("This image could not be opened.")
    val largest = maxOf(decoded.width, decoded.height)
    val scale = minOf(1f, 1800f / largest.coerceAtLeast(1))
    val scaled = if (scale < 1f) Bitmap.createScaledBitmap(decoded, (decoded.width * scale).toInt().coerceAtLeast(1), (decoded.height * scale).toInt().coerceAtLeast(1), true) else decoded
    var result = ""
    for (quality in listOf(86, 76, 66, 56, 46)) {
        val bytes = ByteArrayOutputStream().use { output -> scaled.compress(Bitmap.CompressFormat.JPEG, quality, output); output.toByteArray() }
        result = "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
        if (result.length <= 1_800_000) break
    }
    if (scaled !== decoded) scaled.recycle()
    decoded.recycle()
    require(result.length <= 2_000_000) { "This image is too detailed. Try a smaller image." }
    result
}

private suspend fun prepareFirebaseImage(context: Context, uri: Uri, avatar: Boolean): String = withContext(Dispatchers.IO) {
    val resolver = context.contentResolver
    val length = resolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L
    require(length <= 10L * 1024 * 1024 || length < 0) { "Choose an image smaller than 10 MB." }
    val targetWidth = if (avatar) 420 else 1400
    val targetHeight = if (avatar) 420 else 466
    val maxChars = if (avatar) 180_000 else 520_000
    val decoded = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        ImageDecoder.decodeBitmap(ImageDecoder.createSource(resolver, uri)) { decoder, info, _ ->
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            val maxSource = maxOf(info.size.width, info.size.height)
            val maxNeeded = maxOf(targetWidth, targetHeight) * 2
            var sample = 1
            while (maxSource / (sample * 2) >= maxNeeded) sample *= 2
            decoder.setTargetSampleSize(sample)
        }
    } else resolver.openInputStream(uri)?.use(BitmapFactory::decodeStream)
        ?: error("This image could not be opened.")
    val targetRatio = targetWidth.toFloat() / targetHeight
    val sourceRatio = decoded.width.toFloat() / decoded.height
    val cropWidth: Int
    val cropHeight: Int
    val cropX: Int
    val cropY: Int
    if (sourceRatio > targetRatio) {
        cropHeight = decoded.height
        cropWidth = (decoded.height * targetRatio).toInt()
        cropX = (decoded.width - cropWidth) / 2
        cropY = 0
    } else {
        cropWidth = decoded.width
        cropHeight = (decoded.width / targetRatio).toInt()
        cropX = 0
        cropY = (decoded.height - cropHeight) / 2
    }
    val cropped = Bitmap.createBitmap(decoded, cropX, cropY, cropWidth.coerceAtLeast(1), cropHeight.coerceAtLeast(1))
    var last = ""
    loop@ for (scale in listOf(1f, .82f, .68f)) {
        val scaled = Bitmap.createScaledBitmap(cropped, (targetWidth * scale).toInt(), (targetHeight * scale).toInt(), true)
        for (quality in listOf(84, 72, 60, 48)) {
            val bytes = ByteArrayOutputStream().use { output ->
                scaled.compress(Bitmap.CompressFormat.JPEG, quality, output)
                output.toByteArray()
            }
            last = "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
            if (last.length <= maxChars) {
                if (scaled !== cropped) scaled.recycle()
                break@loop
            }
        }
        if (scaled !== cropped) scaled.recycle()
    }
    if (cropped !== decoded) cropped.recycle()
    decoded.recycle()
    require(last.length <= maxChars) { "This image is too detailed to save. Try a simpler or smaller image." }
    last
}

@Composable
private fun SectionHeader(kicker: String, heading: String, body: String) {
    Column(Modifier.padding(bottom = 12.dp)) {
        Text(kicker, color = Burgundy, fontSize = 10.sp, letterSpacing = 1.3.sp, fontWeight = FontWeight.Black)
        Text(heading, Modifier.padding(top = 5.dp), fontFamily = MaterialTheme.typography.headlineMedium.fontFamily, fontSize = 30.sp, lineHeight = 33.sp, fontWeight = FontWeight.Bold)
        Text(body, Modifier.padding(top = 7.dp), color = Muted, fontSize = 13.sp, lineHeight = 19.sp)
    }
}

@Composable
private fun EmptyFeed(searching: Boolean, arabic: Boolean) = EmptyState(
    "A",
    tr(arabic, if (searching) "No matching posts" else "The studio is ready", if (searching) "لا توجد منشورات مطابقة" else "الاستوديو جاهز"),
    tr(arabic, if (searching) "Try another title, member, or space." else "Be the first member to add to the conversation.", if (searching) "جرّب عنواناً أو عضواً أو مساحة أخرى." else "كن أول عضو يشارك في الحوار."),
)

@Composable
private fun EmptyState(symbol: String, title: String, body: String) {
    Column(Modifier.fillMaxWidth().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(symbol, color = Burgundy.copy(alpha = .32f), fontFamily = MaterialTheme.typography.headlineLarge.fontFamily, fontSize = 48.sp)
        Text(title, fontFamily = MaterialTheme.typography.titleLarge.fontFamily, fontWeight = FontWeight.Bold, fontSize = 21.sp)
        Text(body, Modifier.padding(top = 6.dp), color = Muted, fontSize = 12.sp, lineHeight = 18.sp)
    }
}

private fun shareCommunityLink(context: Context, text: String, title: String, chooserTitle: String) {
    val share = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
        putExtra(Intent.EXTRA_TITLE, title)
    }
    context.startActivity(Intent.createChooser(share, chooserTitle))
}

private fun tr(arabic: Boolean, english: String, arabicText: String) = if (arabic) arabicText else english

private val mentionPattern = Regex("(^|[^A-Za-z0-9_.+\\-])@(?:(?:a/)([a-z0-9-]{3,32})|([a-z0-9_]{3,24}))", setOf(RegexOption.IGNORE_CASE, RegexOption.MULTILINE))

@Composable
private fun MentionText(
    value: String,
    modifier: Modifier = Modifier,
    style: TextStyle = MaterialTheme.typography.bodyMedium,
    maxLines: Int = Int.MAX_VALUE,
    onUser: (String) -> Unit,
    onSpace: (String) -> Unit,
) {
    val annotated = buildAnnotatedString {
        var cursor = 0
        mentionPattern.findAll(value).forEach { match ->
            append(value.substring(cursor, match.range.first))
            val prefix = match.groupValues[1]
            append(prefix)
            val space = match.groupValues[2]
            val user = match.groupValues[3]
            val start = length
            val label = if (space.isNotBlank()) "@a/${space.lowercase()}" else "@${user.lowercase()}"
            append(label)
            addStyle(SpanStyle(color = Burgundy, fontWeight = FontWeight.Bold), start, length)
            addStringAnnotation(if (space.isNotBlank()) "space" else "user", if (space.isNotBlank()) space.lowercase() else user.lowercase(), start, length)
            cursor = match.range.last + 1
        }
        append(value.substring(cursor))
    }
    ClickableText(
        text = annotated,
        modifier = modifier,
        style = style,
        maxLines = maxLines,
        overflow = TextOverflow.Ellipsis,
        onClick = { offset ->
            annotated.getStringAnnotations("user", offset, offset).firstOrNull()?.let { onUser(it.item); return@ClickableText }
            annotated.getStringAnnotations("space", offset, offset).firstOrNull()?.let { onSpace(it.item) }
        },
    )
}

private fun extractBehance(value: String): String {
    val iframe = Regex("src=[\\\"']([^\\\"']+)[\\\"']", RegexOption.IGNORE_CASE).find(value)?.groupValues?.getOrNull(1)
    val candidate = (iframe ?: value).trim().replace("&amp;", "&")
    return if (candidate.matches(Regex("https://(www\\.)?behance\\.net/embed/project/.*", RegexOption.IGNORE_CASE))) candidate else ""
}

private fun relativeTime(timestamp: Timestamp?, arabic: Boolean): String {
    if (timestamp == null) return tr(arabic, "just now", "الآن")
    val seconds = ((System.currentTimeMillis() - timestamp.toDate().time) / 1000).coerceAtLeast(0)
    return when {
        seconds < 60 -> tr(arabic, "just now", "الآن")
        seconds < 3600 -> "${seconds / 60}${tr(arabic, "m ago", " د")}" 
        seconds < 86400 -> "${seconds / 3600}${tr(arabic, "h ago", " س")}" 
        seconds < 604800 -> "${seconds / 86400}${tr(arabic, "d ago", " ي")}" 
        else -> DateFormat.getDateInstance(DateFormat.MEDIUM, if (arabic) Locale.forLanguageTag("ar-IQ") else Locale.ENGLISH).format(Date(timestamp.toDate().time))
    }
}
