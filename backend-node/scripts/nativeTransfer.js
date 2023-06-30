const { ethers } = require("ethers");
const inquirer = require('inquirer');
const { createBiconomyAccountInstance, sendUserOp } = require('./helperFunctions')

const nativeTransfer = async (to, amount, withTokenPaymaster) => {
  const biconomySmartAccount = await createBiconomyAccountInstance()

  // transfer native asset
  const transaction = {
    to: to || "0x0000000000000000000000000000000000000000",
    data: "0x",
    value: ethers.utils.parseEther(amount.toString()),
  }

  // build partial userOp and paymaster data of verifying
  const biconomyPaymaster = biconomySmartAccount.paymaster;
  let partialUserOp = await biconomySmartAccount.buildUserOp([transaction])
  let finalUserOp = partialUserOp
  let paymasterServiceData = {
    "mode": "SPONSORED",
    "calculateGasLimits": true,
    "sponsorshipInfo": {
      "webhookData": {},
      "smartAccountInfo": {
        "name": "BICONOMY",
        "version": "1.0.0"
      }
    }
  }
  // if withTokenPaymaster is true, then get fee quotes and ask user to select one
  if (withTokenPaymaster) {
    const feeQuotesResponse = await biconomyPaymaster?.getPaymasterFeeQuotesOrData(partialUserOp, {
      mode: "ERC20",
      tokenInfo: {
        tokenList: ["0xda5289fcaaf71d52a80a254da614a192b693e977", "0x27a44456bedb94dbd59d0f0a14fe977c777fc5c3"],
        // preferredToken: "0xda5289fcaaf71d52a80a254da614a192b693e977"
      }
    })
    const feeQuotes = feeQuotesResponse.feeQuotes
    const spender = feeQuotesResponse.tokenPaymasterAddress

    // Generate list of options for the user to select
    const choices = feeQuotes.map((quote, index) => ({
      name: `Option ${index + 1}: ${quote.symbol}`,
      value: index
    }));
    // Use inquirer to prompt user to select an option
    const { selectedOption } = await inquirer.prompt([{
      type: 'list',
      name: 'selectedOption',
      message: 'Select a fee quote:',
      choices
    }]);
    const selectedFeeQuote = feeQuotes[selectedOption];
    // pm_getFeeQuoteOrData
    finalUserOp = await biconomySmartAccount.buildTokenPaymasterUserOp(partialUserOp, {
      feeQuote: selectedFeeQuote,
      spender: spender,
      maxApproval: false
    })

    paymasterServiceData = {
      "mode": "ERC20",
      "calculateGasLimits": true,
      "tokenInfo": {
        "feeTokenAddress": selectedFeeQuote.tokenAddress
      }
    }
  }

  try {
    const paymasterAndDataWithLimits = await biconomyPaymaster?.getPaymasterAndData(finalUserOp, paymasterServiceData);

    finalUserOp.paymasterAndData = paymasterAndDataWithLimits.paymasterAndData
    if (paymasterAndDataWithLimits.callGasLimit && paymasterAndDataWithLimits.verificationGasLimit && paymasterAndDataWithLimits.preVerificationGas) {
      finalUserOp.callGasLimit = paymasterAndDataWithLimits.callGasLimit
      finalUserOp.verificationGasLimit = paymasterAndDataWithLimits.verificationGasLimit
      finalUserOp.preVerificationGas = paymasterAndDataWithLimits.preVerificationGas
    }
    await sendUserOp(biconomySmartAccount, finalUserOp)
  } catch (e) {
    console.log('error received ', e)
  }
}

module.exports = { nativeTransfer };