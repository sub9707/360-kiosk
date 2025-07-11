plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "com.howdoyoudo.camera_360"
    compileSdk = 35 // 최신 SDK 버전

    defaultConfig {
        applicationId = "com.howdoyoudo.camera_360"
        minSdk = 24 // Android 7.0 Nougat
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11 // Java 11 사용
        targetCompatibility = JavaVersion.VERSION_11 // Java 11 사용
    }
    kotlinOptions {
        jvmTarget = "11" // Kotlin도 JVM 11 타겟
    }
    // 여기에 buildFeatures 블록을 추가하여 View Binding을 활성화합니다.
    buildFeatures {
        viewBinding = true
    }
}

dependencies {

    // AndroidX Core & Appcompat
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.material)
    implementation(libs.androidx.activity)
    implementation(libs.androidx.constraintlayout)

    // Lifecycle components (ViewModel, LiveData)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.ktx)
    implementation(libs.androidx.lifecycle.livedata.ktx)

    // CameraX
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.core)
    implementation(libs.androidx.camera.extensions)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.video)
    implementation(libs.androidx.camera.view)


    implementation(libs.java.websocket)

    // Kotlin Coroutines for asynchronous operations
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.coroutines.android)

    implementation(libs.nanohttpd)

    // Testing
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)

}