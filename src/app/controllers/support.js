angular.module('proton.controllers.Support', [
    'proton.models'
])

.controller('SupportController', (
    $rootScope,
    $scope,
    $state,
    $log,
    authentication,
    CONSTANTS,
    User,
    tools,
    notify,
    Reset,
    setupKeys,
    Key,
    networkActivityTracker
) => {
    $scope.keyPhase = CONSTANTS.KEY_PHASE;

    $scope.states = {
        RECOVERY: 1,
        CODE: 2,
        DANGER: 3,
        PASSWORD: 4,
        GENERATE: 5,
        INSTALL: 6
    };

    $scope.tools = tools;
    $scope.params = {};
    $scope.params.recoveryEmail = '';
    $scope.params.username = '';

    function resetState() {
        $scope.params.resetToken = '';
        $scope.params.danger = '';
        $scope.params.password = '';
        $scope.params.passwordConfirm = '';

        $scope.resetState = $scope.states.RECOVERY;
    }

    let passwordMode = 0;

    resetState();

    // Installing
    $scope.resetAccount = false;
    $scope.logUserIn = false;
    $scope.finishInstall = false;

    $scope.getMessageTitle = function () {
        return $state.params.data.title || '';
    };

    $scope.getMessageContent = function () {
        return $state.params.data.content || '';
    };

    $scope.getMessageType = function () {
        return $state.params.data.type || '';
    };

    /**
     * Request a token to reset login pass. Some validation first.
     * Shows errors otherwise sets a flag to show a different form
     */
    $scope.resetLostPassword = function () {
        $scope.params.username = $scope.params.username;
        networkActivityTracker.track(
            Reset.requestResetToken({
                Username: $scope.params.username,
                NotificationEmail: $scope.params.recoveryEmail
            })
            .then((result) => {
                if (result.data && result.data.Code === 1000) {
                    $scope.resetState = $scope.states.CODE;
                } else if (result.data && result.data.Error) {
                    notify({ message: result.data.Error, classes: 'notification-danger' });
                }
            })
        );
    };

    /**
     * Validates the token and shows the last form
     * @param form {Form}
     */
    $scope.validateToken = function () {

        $scope.tokenParams = {
            Username: $scope.params.username,
            Token: $scope.params.resetToken
        };

        Reset.validateResetToken($scope.tokenParams)
        .then(({ data = {} }) => {
            if (data.Code === 1000) {

                passwordMode = data.PasswordMode;
                $scope.addresses = data.Addresses;

                $scope.resetState = $scope.states.DANGER;
                if (passwordMode === 2 && $scope.keyPhase < 3) {
                    $scope.resetState = $scope.states.PASSWORD;
                }
            } else {
                return Promise.reject({
                    message: data.Error || 'Unable to verify reset token'
                });
            }

        })
        .catch((error) => {
            resetState();
            $log.error(error);
            notify({
                classes: 'notification-danger',
                message: error.message
            });
        });
    };

    $scope.confirmReset = function () {
        $scope.resetState = $scope.states.PASSWORD;
    };

    function doReset() {
        if (passwordMode === 2 && $scope.keyPhase < 3) {
            return Reset.resetPassword($scope.tokenParams, $scope.params.password)
            .then((response = {}) => {

                const { data = {} } = response;

                if (data.Code === 1000) {
                    return response;
                }

                return Promise.reject({
                    message: data.Error || 'Unable to update password. Please try again'
                });
            });
        }

        return generateKeys().then(installKeys);
    }

    function generateKeys() {

        $log.debug('generateKeys');
        $scope.resetState = $scope.states.GENERATE;

        return setupKeys.generate($scope.addresses, $scope.params.password);
    }

    function installKeys(data = {}) {

        $log.debug('installKeys');
        $scope.resetState = $scope.states.INSTALL;
        $scope.resetAccount = true;

        return setupKeys.reset(data, $scope.params.password, $scope.tokenParams);
    }

    function doLogUserIn() {
        $scope.logUserIn = true;
        return authentication.loginWithCredentials({
            Username: $scope.params.username,
            Password: $scope.params.password
        })
        .then(({ data }) => {
            $rootScope.isLoggedIn = true;
            return data;
        });
    }

    function finishRedirect(authResponse) {

        $log.debug('finishRedirect');
        $scope.finishInstall = true;

        $state.go('login.unlock', { creds: $scope.params, authResponse });
    }

    /**
     * Saves new login pass. Shows success page.
     * @param form {Form}
     */
    $scope.resetPassword = function () {

        networkActivityTracker.track(
        doReset()
        .then(doLogUserIn)
        .then(finishRedirect)
        .catch((error) => {
            $log.error(error);
            resetState();
            notify({
                classes: 'notification-danger',
                message: error.message
            });
        }));
    };
});
