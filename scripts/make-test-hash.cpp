// Prints a credential row the IAM tables accept, using the real hasher.
//
// The hasher is the only authority on the stored format, so seeding test
// credentials by reimplementing scrypt in another language would risk a subtly
// different hash. This links the actual library instead.
//
// Build and run:
//   scripts/seed-test-account.sh <username> <password> [party-id]

#include "ores.security/crypto/password_hasher.hpp"
#include <iostream>
#include <string>

int main(int argc, char* argv[]) {
    if (argc != 3) {
        std::cerr << "usage: make-test-hash <username> <password>\n";
        return 2;
    }
    const std::string username = argv[1];
    const std::string password = argv[2];

    const auto hash = ores::security::crypto::password_hasher::hash(password);
    if (!ores::security::crypto::password_hasher::verify(password, hash)) {
        std::cerr << "self-check failed: hash does not verify\n";
        return 1;
    }

    std::cout << username << '\t' << hash << '\n';
    return 0;
}
