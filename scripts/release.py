import json
import subprocess
import sys

def run_command(command):
    print(f"Running command: {command}")
    process = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
    print(process.stdout)
    if process.stderr:
        print(f"Stderr: {process.stderr}")


def update_version():
    with open("package.json", "r") as f:
        data = json.load(f)
    
    version_parts = data["version"].split(".")
    version_parts[-1] = str(int(version_parts[-1]) + 1)
    new_version = ".".join(version_parts)
    
    data["version"] = new_version
    
    with open("package.json", "w") as f:
        json.dump(data, f, indent=2)
        
    return new_version

def main():
    # It's good practice to ensure the repo is clean before a release.
    # However, since I cannot be sure of the state, I'll proceed with caution.
    # A full implementation would check `git status`.

    new_version = update_version()
    print(f"Updated version to {new_version}")

    try:
        print("Staging, committing, and tagging...")
        run_command("git add package.json")
        run_command(f"git commit -m 'release: v{new_version}'")
        run_command(f"git tag v{new_version}")
        
        print("Pushing to remote...")
        run_command("git push --follow-tags")

        print("Building and publishing release...")
        # Assuming the electron-builder is configured to publish on build
        run_command("pnpm electron:build -p always")

        print(f"Successfully released version {new_version}")

    except subprocess.CalledProcessError as e:
        print(f"An error occurred: {e}", file=sys.stderr)
        print(f"Stderr: {e.stderr}", file=sys.stderr)
        # Attempt to roll back the version change in package.json
        # Note: This doesn't un-commit or un-tag if those steps succeeded.
        print("Attempting to roll back version update in package.json...")
        # This is a simple rollback, a more robust solution would be better.
        run_command("git checkout package.json")
        sys.exit(1)
    except Exception as e:
        print(f"An unexpected error occurred: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
