import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Star, Gift, Award } from 'lucide-react-native';

const LoyaltyDashboard = () => {
  return (
    <View className="dark:bg-gray-900 p-4 rounded-xl shadow-sm">
      {/* Current Tier Card */}
      <View className="bg-gray-100 dark:bg-gray-800 rounded-xl shadow-lg p-5 mb-4 items-center">
        <Star size={48} color="#f59e0b" fill="#f59e0b" />
        <Text className="text-3xl font-extrabold mt-3 text-amber-600 dark:text-amber-400">Gold Member</Text>
        <Text className="text-gray-600 mt-1 text-center">
          You're just <Text className="font-bold">250 points</Text> away from Platinum!
        </Text>
        <TouchableOpacity className="mt-4 bg-amber-500 py-3 px-6 rounded-full">
          <Text className="text-white font-semibold text-lg">View Benefits</Text>
        </TouchableOpacity>
      </View>

      {/* Points Balance */}
      <View className="bg-gray-100 dark:bg-gray-800 rounded-xl shadow-lg p-5 mb-4">
        <View className="flex-row items-center mb-3">
          <Award size={24} color="#3b82f6" />
          <Text className="text-xl font-semibold ml-2 text-gray-800 dark:text-white">Points Balance</Text>
        </View>
        <Text className="text-4xl font-extrabold text-blue-600 mb-2">7,850 Points</Text>
        <Text className="text-gray-600">Earned through event attendance and purchases.</Text>
      </View>

      {/* Recent Rewards/Activities */}
      <View className="bg-gray-100 dark:bg-gray-800 rounded-xl shadow-lg p-5">
        <Text className="text-xl font-semibold mb-3 text-gray-800 dark:text-white">Recent Activities</Text>
        <View className="flex-row justify-between items-center py-2 border-b border-gray-200">
          <View>
            <Text className="font-medium text-gray-800 dark:text-white">Earned 150 points</Text>
            <Text className="text-sm text-gray-500">Attended "Summer Music Festival"</Text>
          </View>
          <Text className="text-green-600 font-semibold">+150</Text>
        </View>
        <View className="flex-row justify-between items-center py-2">
          <View>
            <Text className="font-medium text-gray-800">Redeemed 500 points</Text>
            <Text className="text-sm text-gray-500">For a discount voucher</Text>
          </View>
          <Text className="text-red-600 font-semibold">-500</Text>
        </View>
      </View>
    </View>
  );
};

export default LoyaltyDashboard;
