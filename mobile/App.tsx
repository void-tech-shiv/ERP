import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, BackHandler, Pressable, StatusBar, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { isAllowedNavigation, resolveAttendlyUrl } from './src/connection';

/**
 * Phase 1: native mobile shell around the existing Attendly site.
 * ERP login + CAPTCHA stay inside the first-party WebView, preserving
 * same-origin CSRF and HttpOnly session cookies without a credential bridge.
 */
export default function App() {
  const endpoint=useMemo(
    ()=>resolveAttendlyUrl(process.env.EXPO_PUBLIC_ATTENDLY_URL,__DEV__),[],
  );
  const web=useRef<WebView<{}>>(null);
  const [canGoBack,setCanGoBack]=useState(false);
  const [loading,setLoading]=useState(true);
  const [connectionError,setConnectionError]=useState(false);

  useEffect(()=>{
    const listener=BackHandler.addEventListener('hardwareBackPress',()=>{
      if(!canGoBack)return false;
      web.current?.goBack();
      return true;
    });
    return ()=>listener.remove();
  },[canGoBack]);

  const reload=useCallback(()=>{
    setConnectionError(false);
    setLoading(true);
    web.current?.reload();
  },[]);

  return (
    <SafeAreaView style={styles.safe} edges={['top','bottom']}>
      <StatusBar barStyle="dark-content"/>
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>A</Text></View>
          <View>
            <Text style={styles.logo}>attendly<Text style={styles.dot}>.</Text></Text>
            <Text style={styles.subtitle}>Student workspace</Text>
          </View>
        </View>
        {endpoint.ok&&<View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back"
            accessibilityState={{disabled:!canGoBack}} disabled={!canGoBack}
            style={[styles.action,!canGoBack&&styles.disabled]}
            onPress={()=>web.current?.goBack()}>
            <Text style={styles.actionGlyph}>‹</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh Attendly"
            style={styles.action} onPress={reload}>
            <Text style={styles.actionGlyph}>↻</Text>
          </Pressable>
        </View>}
      </View>

      {!endpoint.ok?
        <View style={styles.messageWrap}>
          <View style={styles.messageBox}>
            <Text style={styles.messageTitle}>Connect your Attendly server</Text>
            <Text style={styles.messageText}>{endpoint.reason}</Text>
            <Text style={styles.helpText}>
              Set the server address in mobile/.env and restart Expo.
              Never enter ERP credentials or tokens in the environment file.
            </Text>
          </View>
        </View>
        :
        <View style={styles.browser}>
          <WebView<{}>
            ref={web}
            source={{uri:endpoint.url}}
            originWhitelist={[endpoint.origin]}
            onShouldStartLoadWithRequest={request=>
              isAllowedNavigation(request.url,endpoint.origin)}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled={false}
            javaScriptCanOpenWindowsAutomatically={false}
            setSupportMultipleWindows={false}
            mixedContentMode="never"
            allowsBackForwardNavigationGestures
            startInLoadingState
            cacheEnabled={false}
            onLoadStart={()=>{setLoading(true);setConnectionError(false);}}
            onLoadEnd={()=>setLoading(false)}
            onNavigationStateChange={nav=>{
              setCanGoBack(nav.canGoBack);
              if(!isAllowedNavigation(nav.url,endpoint.origin))web.current?.stopLoading();
            }}
            onError={()=>{
              // Do not print native request diagnostics; URLs may be sensitive.
              setLoading(false);
              setConnectionError(true);
            }}
            renderLoading={()=><View style={styles.loading}>
              <ActivityIndicator size="large" color="#6658ed"/>
              <Text style={styles.loadingText}>Loading Attendly…</Text>
            </View>}
            style={styles.web}
          />
          {loading&&<View style={styles.loadLine}><View style={styles.loadLineActive}/></View>}
          {connectionError&&<View style={styles.errorOverlay}>
            <View style={styles.messageBox}>
              <Text style={styles.messageTitle}>Unable to open Attendly</Text>
              <Text style={styles.messageText}>
                Check that your Attendly server is running and reachable from your phone.
              </Text>
              <Pressable accessibilityRole="button" style={styles.retry} onPress={reload}>
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          </View>}
        </View>
      }
    </SafeAreaView>
  );
}
const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:'#fff'},
  header:{minHeight:65,paddingHorizontal:16,flexDirection:'row',
    alignItems:'center',justifyContent:'space-between',backgroundColor:'#fff',
    borderBottomColor:'#e7e9f2',borderBottomWidth:1},
  brand:{flexDirection:'row',alignItems:'center',gap:10},
  brandMark:{width:39,height:39,backgroundColor:'#6658ed',borderRadius:12,
    alignItems:'center',justifyContent:'center'},
  brandMarkText:{color:'#fff',fontWeight:'900',fontSize:23},
  logo:{color:'#1c2944',fontSize:21,fontWeight:'800',letterSpacing:-0.8},
  dot:{color:'#6658ed'},
  subtitle:{color:'#8794aa',fontSize:10,fontWeight:'600',marginTop:1},
  actions:{flexDirection:'row',gap:9,alignItems:'center'},
  action:{minHeight:44,minWidth:44,justifyContent:'center',alignItems:'center',
    borderRadius:13,backgroundColor:'#f0eeff'},
  actionGlyph:{color:'#6658ed',fontWeight:'700',fontSize:28},
  disabled:{opacity:0.3},
  browser:{flex:1,backgroundColor:'#f8f9fd'},
  web:{flex:1,backgroundColor:'#f8f9fd'},
  loading:{position:'absolute',top:0,right:0,bottom:0,left:0,
    justifyContent:'center',alignItems:'center',gap:12,backgroundColor:'#f8f9fd'},
  loadingText:{color:'#586782',fontSize:14,fontWeight:'600'},
  loadLine:{position:'absolute',top:0,left:0,right:0,height:2,backgroundColor:'#e9e7ff'},
  loadLineActive:{width:'43%',height:2,backgroundColor:'#6658ed'},
  messageWrap:{flex:1,justifyContent:'center',paddingHorizontal:22,backgroundColor:'#f8f9fd'},
  messageBox:{backgroundColor:'#fff',padding:23,borderRadius:18,
    borderColor:'#e7e9f2',borderWidth:1,gap:10},
  messageTitle:{fontSize:20,fontWeight:'800',color:'#1c2944'},
  messageText:{fontSize:14,color:'#506078',lineHeight:22},
  helpText:{color:'#7b8aa2',lineHeight:20,marginTop:4,fontSize:12},
  errorOverlay:{position:'absolute',top:0,right:0,bottom:0,left:0,
    justifyContent:'center',paddingHorizontal:22,backgroundColor:'#f8f9fd'},
  retry:{marginTop:12,paddingHorizontal:22,minHeight:48,alignSelf:'flex-start',
    justifyContent:'center',borderRadius:10,backgroundColor:'#6658ed'},
  retryText:{color:'#fff',fontWeight:'800',fontSize:14},
});
