import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ArrowRightLeft, DollarSign, Repeat2 } from 'lucide-react-native';

const ExchangeView = () => {
  return (
    <View className="dark:bg-gray-900 p-4 rounded-xl shadow-sm">
      <View className="bg-gray-100 dark:bg-gray-800 rounded-xl shadow-lg p-5 mb-4">
        <View className="flex-row items-center mb-3">
          <DollarSign size={24} color="#10b981" />
          <Text className="text-xl font-semibold ml-2 text-gray-800 dark:text-white">Your Exchange Balance</Text>
        </View>
        <Text className="text-4xl font-extrabold text-green-600 mb-2">1,250 TOKENS</Text>
        <Text className="text-gray-600">Equivalent to $125.00 USD</Text>
        <TouchableOpacity className="mt-4 bg-green-500 py-3 px-5 rounded-full self-start">
          <Text className="text-white font-semibold text-lg">Deposit Tokens</Text>
        </TouchableOpacity>
      </View>

      {/* Exchange Actions */}
      <View className="flex-row justify-around mb-4">
        <TouchableOpacity className="flex-1 items-center bg-indigo-500 p-4 rounded-xl mx-1 shadow-md">
          <ArrowRightLeft size={32} color="white" />
          <Text className="text-white font-semibold mt-2">Swap Tokens</Text>
        </TouchableOpacity>
        <TouchableOpacity className="flex-1 items-center bg-purple-500 p-4 rounded-xl mx-1 shadow-md">
          <Repeat2 size={32} color="white" />
          <Text className="text-white font-semibold mt-2">Trade History</Text>
        </TouchableOpacity>
      </View>

      {/* Exchange Rates/Info */}
      <View className="bg-gray-100 dark:bg-gray-800 rounded-xl shadow-lg p-5 mb-4">
        <Text className="text-xl font-semibold mb-3 text-gray-800">Current Rates</Text>
        <View className="flex-row justify-between py-2 border-b border-gray-200">
          <Text className="text-gray-700">1 TOKEN</Text>
          <Text className="font-medium text-gray-800">0.10 USD</Text>
        </View>
        <View className="flex-row justify-between py-2">
          <Text className="text-gray-700">100 TOKENS</Text>
          <Text className="font-medium text-gray-800">1 Event Ticket</Text>
        </View>
        <Text className="text-sm text-gray-500 mt-3">Rates are subject to change based on market conditions.</Text>
      </View>

      {/* Recent Transactions */}
      <View className="bg-gray-100 dark:bg-gray-800 rounded-xl shadow-lg p-5">
        <Text className="text-xl font-semibold mb-3 text-gray-800 dark:text-white">Recent Transactions</Text>
        <View className="flex-row justify-between items-center py-2 border-b border-gray-200">
          <View>
            <Text className="font-medium text-gray-800 dark:text-white">Swap: 50 TOKENS for 5 USD</Text>
            <Text className="text-sm text-gray-500">2 hours ago</Text>
          </View>
          <Text className="text-green-600 font-semibold">+5 USD</Text>
        </View>
        <View className="flex-row justify-between items-center py-2">
          <View>
            <Text className="font-medium text-gray-800">Deposit: 200 TOKENS</Text>
            <Text className="text-sm text-gray-500">Yesterday</Text>
          </View>
          <Text className="text-green-600 font-semibold">+200 TOKENS</Text>
        </View>
      </View>
    </View>
  );
};

export default ExchangeView;
