

import React from 'react';
import { SafeAreaView, Text } from 'react-native';
import { NavigationContainer, StackRouter } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

function App(): React.JSX.Element {
  const Stack = createNativeStackNavigator();

  return (

    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name='Login' component={Login}/>
        <Stack.Screen name="SignUp" component={SignUp} />

      </Stack.Navigator>
    </NavigationContainer>
  );
}




export default App;
